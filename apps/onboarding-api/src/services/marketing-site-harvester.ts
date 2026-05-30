import { withStealthPage } from './playwright-browser.service.js'

export interface MarketingSiteData {
  name: string | null
  description: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  email: string | null
  images: string[]
  amenities: string[]
  roomDescriptions: Array<{ name: string; description: string; images: string[] }>
}

const SECTION_LINKS_RE = /about|contact|rooms?|accommodation|services?|facilit|galerie|gallery|über|nosotros|à propos/i

async function scrapePage(url: string): Promise<{
  name: string | null; text: string; images: string[]; phone: string | null; email: string | null; address: string | null
}> {
  return withStealthPage(url, async (page) => {
    try { await page.waitForSelector('main, article, section, body', { timeout: 10000 }) } catch {}
    await page.waitForTimeout(1500)

    // Expand any navigation structure on the page — hamburger, dropdowns, toggles, accordions.
    // Hotels put contact/address info behind nav menus; click anything that looks expandable.
    await page.evaluate(() => {
      const navRe = /hamburger|toggle|menu|burger|nav|sidebar|mobile|collapse|accordion|panel/i
      const expandClicked = new Set<Element>()

      // 1. aria-expanded="false" — any collapsed disclosure widget
      for (const el of Array.from(document.querySelectorAll('[aria-expanded="false"]'))) {
        if ((el as HTMLElement).offsetParent !== null) { (el as HTMLElement).click(); expandClicked.add(el) }
      }

      // 2. Elements with nav-related class/id/aria
      for (const el of Array.from(document.querySelectorAll('button, [role="button"], [class*="toggle"], [class*="open"]'))) {
        if (expandClicked.has(el)) continue
        const h = el as HTMLElement
        if (h.offsetParent === null) continue
        const cls = (h.className || '') + (h.id || '') + (h.getAttribute('aria-label') || '') + (h.getAttribute('data-target') || '')
        if (navRe.test(cls)) { h.click(); expandClicked.add(h) }
      }

      // 3. Small icon-only buttons that are nav toggles (≡ ☰ ← → × + icons)
      for (const el of Array.from(document.querySelectorAll('button, a'))) {
        if (expandClicked.has(el)) continue
        const h = el as HTMLElement
        if (h.offsetParent === null) continue
        const text = h.innerText?.trim()
        const rect = h.getBoundingClientRect()
        // Small square-ish element with a toggle icon
        if (text && rect.width < 60 && rect.height < 60 && /^[≡☰←→×✕\+\-▼▶]$/.test(text)) h.click()
      }
    }).catch(() => {})
    await page.waitForTimeout(800)

    return page.evaluate(() => {
      const bodyText = document.body.innerText ?? ''
      const phoneMatch = bodyText.match(/(?:\+|00)[0-9 .\-()]{7,20}|0[0-9]{9,10}/)
      const emailMatch = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/)
      // Find address: prefer elements containing a street number (digit at start of a line)
      // Scan candidate elements and pick the one that looks most like a real address
      const addrCandidates = Array.from(document.querySelectorAll(
        '[class*="address"],[class*="Address"],[itemprop="address"],[itemprop="streetAddress"],' +
        '[class*="contact-info"],[class*="ContactInfo"],[class*="adresse"]'
      ))
      const addrEl = addrCandidates.find(el => {
        const t = (el as HTMLElement).innerText?.trim() ?? ''
        return /^\d|\b\d{4,6}\b/.test(t) && t.length < 200
      }) ?? null
      const seen = new Set<string>()
      const images: string[] = []
      for (const el of Array.from(document.querySelectorAll('img'))) {
        const src = (el as HTMLImageElement).src
        if (src?.startsWith('http') && !seen.has(src)) { seen.add(src); images.push(src) }
        if (images.length >= 30) break
      }
      // Hotel name — prefer h1, fall back to title; strip SEO suffixes after | - –
      const rawH1 = document.querySelector('h1')?.textContent?.trim() ?? ''
      const rawTitle = document.title ?? ''
      const raw = rawH1 || rawTitle.split(/[|\-–]/)[0]?.trim() || ''
      const name = /select.*accommodat|choose.*room|search.*room|availab|book\s*now|r[eé]serv|buchen|reserv|prenot|réserv|check.?in|sign\s*in|log\s*in/i.test(raw) ? null : (raw.slice(0, 80) || null)
      // Meaningful paragraphs only
      const text = Array.from(document.querySelectorAll('p, [class*="description"], [class*="about"], [class*="overview"], [class*="intro"]'))
        .map(e => (e as HTMLElement).innerText?.trim())
        .filter(t => t && t.length > 40)
        .slice(0, 5).join('\n').slice(0, 2000)
      return {
        name,
        text,
        images,
        phone: phoneMatch?.[0]?.trim() ?? null,
        email: emailMatch?.[0]?.trim() ?? null,
        address: (() => {
          if (!addrEl) return null
          let raw = (addrEl as HTMLElement).innerText?.trim() ?? ''
          // Strip phone numbers
          raw = raw.replace(/(?:Tel[:\s.]*)?(?:\+|00)[0-9 .\-()]{7,20}/gi, '')
          // Strip email addresses
          raw = raw.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/gi, '')
          // Strip "Tel:", "Fax:", "Email:" labels
          raw = raw.replace(/\b(Tel|Fax|Email|E-mail|Phone|Tél)[:\s.]*/gi, '')
          // Normalise whitespace and newlines
          raw = raw.replace(/\s{2,}/g, ' ').replace(/\n+/g, ', ').trim()
          // Remove leading hotel name if it runs into the address (no separator)
          // Keep only the street/city/postal portion — take from first digit
          const fromDigit = raw.match(/\d.+/)
          return (fromDigit ? fromDigit[0] : raw).slice(0, 150) || null
        })(),
      }
    })
  }, { idleTimeout: 8000 })
}

export async function harvestMarketingSite(
  websiteUrl: string,
  onProgress: (msg: string) => void,
): Promise<MarketingSiteData> {
  const result: MarketingSiteData = {
    name: null, description: null, address: null, latitude: null, longitude: null,
    phone: null, email: null, images: [], amenities: [], roomDescriptions: [],
  }

  onProgress(`Scraping marketing site: ${websiteUrl}`)

  // Step 1: Homepage
  try {
    const home = await scrapePage(websiteUrl)
    if (home.description) result.description = home.description  // will be set below
    if (home.text) result.description = home.text
    if (home.name) result.name = home.name
    result.images = home.images
    result.phone = home.phone
    result.email = home.email
    result.address = home.address
    onProgress(`  → homepage: ${home.name ? home.name + ' · ' : ''}${home.images.length} image(s), phone=${home.phone ?? '—'}, email=${home.email ?? '—'}`)
  } catch {
    onProgress('  → homepage failed, skipping')
    return result
  }

  // Step 2: Find and follow relevant internal links (About, Contact, Rooms, etc.)
  try {
    const internalLinks = await withStealthPage(websiteUrl, async (page) => {
      try { await page.waitForSelector('a', { timeout: 8000 }) } catch {}
      return page.evaluate((reSrc: string) => {
        const re = new RegExp(reSrc, 'i')
        const origin = window.location.origin
        const seen = new Set<string>()
        const links: Array<{ href: string; text: string }> = []
        for (const a of Array.from(document.querySelectorAll('a[href]'))) {
          const href = (a as HTMLAnchorElement).href
          const text = (a as HTMLElement).innerText?.trim()
          if (href?.startsWith(origin) && re.test(text) && !seen.has(href)) {
            seen.add(href)
            links.push({ href, text })
          }
          if (links.length >= 8) break
        }
        return links
      }, SECTION_LINKS_RE.source)
    }, { idleTimeout: 6000 })

    for (const link of internalLinks.slice(0, 4)) {
      try {
        onProgress(`  → scraping ${link.text}: ${link.href}`)
        const page = await scrapePage(link.href)
        if (page.images.length > result.images.length) result.images = page.images
        if (!result.phone && page.phone) result.phone = page.phone
        if (!result.email && page.email) result.email = page.email
        if (!result.address && page.address) result.address = page.address
        if (!result.description && page.text) result.description = page.text
        onProgress(`    → ${page.images.length} images, phone=${page.phone ?? '—'}`)
      } catch { /* skip failed sub-page */ }
    }
  } catch { /* non-fatal */ }

  // Validate address — must look like a real street address (has street word + number, or postal code)
  if (result.address) {
    const a = result.address
    const hasStreet = /\b(rue|boulevard|avenue|road|street|str\.|via|calle|strasse|pl\.?|sq\.?|drive|lane|way)\b/i.test(a)
    const hasPostal = /\b\d{4,6}\b/.test(a)
    const hasNumber = /^\d+\s+\w/.test(a) // starts with house number
    if (!hasStreet && !hasPostal && !hasNumber) {
      onProgress(`  → address "${a.slice(0, 50)}" looks like description text, skipping geocode`)
      result.address = null
    }
  }

  // Geocode — try address first, fall back to hotel name if address fails
  const geocode = async (query: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=1&addressdetails=1`,
        { headers: { 'User-Agent': 'HyperGuest-IBE-Onboarding/1.0' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) return null
      const data = await res.json() as Array<{ lat: string; lon: string }>
      return data.length > 0 ? { lat: parseFloat(data[0]!.lat), lon: parseFloat(data[0]!.lon) } : null
    } catch { return null }
  }

  if (!result.latitude) {
    // Try 1: street address
    if (result.address) {
      onProgress(`  → geocoding address: ${result.address.slice(0, 60)}`)
      const coords = await geocode(result.address)
      if (coords) {
        result.latitude = coords.lat; result.longitude = coords.lon
        onProgress(`  → coordinates: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`)
      }
    }
    // Try 2: hotel name (geocodes to the property directly)
    if (!result.latitude && result.name) {
      onProgress(`  → geocoding by name: ${result.name}`)
      const coords = await geocode(result.name)
      if (coords) {
        result.latitude = coords.lat; result.longitude = coords.lon
        onProgress(`  → coordinates: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`)
      } else {
        onProgress('  → geocoding: no result found')
      }
    }
  }

  onProgress(`  → marketing site done: ${result.images.length} images, desc=${result.description ? result.description.length + ' chars' : 'none'}`)
  return result
}

export function mergeMarketingData(
  harvestedData: Record<string, unknown>,
  marketing: MarketingSiteData,
): Record<string, unknown> {
  const merged = { ...harvestedData }
  // Only fill gaps — never overwrite booking engine data
  // Always prefer marketing site name — IBE booking pages often show generic headings
  if (marketing.name) merged['name'] = marketing.name
  if (!merged['address'] && marketing.address) merged['address'] = marketing.address
  if (!merged['latitude'] && marketing.latitude) merged['latitude'] = marketing.latitude
  if (!merged['longitude'] && marketing.longitude) merged['longitude'] = marketing.longitude
  if (!merged['phone'] && marketing.phone) merged['phone'] = marketing.phone
  if (!merged['email'] && marketing.email) merged['email'] = marketing.email
  if (!merged['description'] && marketing.description) merged['description'] = marketing.description
  // Merge images: add marketing images not already in the set
  const existingImgs = new Set(Array.isArray(merged['images']) ? merged['images'] as string[] : [])
  const newImgs = marketing.images.filter(u => !existingImgs.has(u))
  if (newImgs.length > 0) merged['images'] = [...(merged['images'] as string[] ?? []), ...newImgs].slice(0, 40)
  // Merge amenities
  const existingAmen = new Set(Array.isArray(merged['amenities']) ? merged['amenities'] as string[] : [])
  const newAmen = marketing.amenities.filter(a => !existingAmen.has(a))
  if (newAmen.length > 0) merged['amenities'] = [...(merged['amenities'] as string[] ?? []), ...newAmen]
  return merged
}
