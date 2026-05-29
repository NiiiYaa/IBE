// One-time seed: import all hardcoded OTA/blocked entries into OnboardingBlockedDomain table.
// Safe to run multiple times — uses upsert so it won't duplicate.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const OTA_EXACT = [
  'google.com','bing.com','yahoo.com','duckduckgo.com',
  'wikipedia.org','wikidata.org',
  'facebook.com','instagram.com','twitter.com','x.com','linkedin.com','youtube.com','tiktok.com',
  'yelp.com','zoominfo.com','yellowpages.com','foursquare.com',
  'trustpilot.com','glassdoor.com','opencorporates.com','dnb.com',
  'indeed.com','caterer.com','totaljobs.com','reed.co.uk',
  'ebay.com','ebay.co.uk','amazon.com','amazon.co.uk',
  'companies-house.gov.uk','companieshouse.gov.uk',
  'find-and-update.company-information.service.gov.uk',
  'lonelyplanet.com','roughguides.com','fodors.com','frommers.com',
  'cntraveler.com','cntraveller.com','travelandleisure.com','afar.com',
  'theguardian.com','telegraph.co.uk','independent.co.uk',
  'nytimes.com','forbes.com','timeout.com','timeout.co.uk',
  'businesstraveller.com','businesstravelnews.com',
  'travelweekly.com','travelweekly.co.uk',
  'travelmole.com','ttgmedia.com','phocuswire.com','skift.com',
  'visitlondon.com','visitengland.com','visitscotland.com','visitwales.com',
  'visitspain.es','spain.info','italia.it','france.fr','germany.travel',
  'discovergreece.com','visitdubai.com','tourismthailand.org',
  'hotelhunter.com','lodging-world.com','hotel-dir.com',
  'venere.com','bedandbreakfast.com','bedandbreakfast.eu',
  'guestreservations.com','online-reservations.com',
  'hotel.com','hotel.de','reservations.com',
  'godaddy.com','sedo.com','dan.com','afternic.com',
  'parkingcrew.com','bodis.com','hugedomains.com','undeveloped.com',
  'squadhelp.com','brandbucket.com',
  'com-hotel.com','hotels-rates.com','hotel-rates.com','hotels-book.com',
  'book-hotel.com','hotelbooking.com',
  'hotelsinsofia.net',
]

const OTA_BRANDS = [
  'booking','agoda','priceline','kayak','rentalcars','opentable',
  'expedia','hotels','travelocity','orbitz','cheaptickets',
  'hotwire','wotif','trivago','ebookers','vrbo',
  'trip','ctrip','skyscanner','qunar',
  'tripadvisor','viator','thefork',
  'lastminute','edreams','opodo','govoyages','liligo',
  'hrs','despegar','decolar','makemytrip','goibibo',
  'traveloka','airbnb','hometogo','destinia','logitravel',
  'laterooms','getaroom','hostelworld','hostelbookers',
  'momondo','hotelscombined','wego','hotelsclick',
  'onthebeach','loveholidays','jet2','jet2holidays',
  'tui','thomascook','firstchoice','virginholidays',
  'holidaycheck','holidayautos',
  'zenhotels','hotelmix','cozycozy','booked','rakuten','roomkey','prestigia',
]

const OTA_KEYWORDS = [
  '.com-hotel.',
  'tripadvisor.',
  'kayak.',
  'onthebeach.',
  'google.co.',
  'forsale.',
  'for-sale.',
  'tourism',
  'touristboard','tourismboard','touristoffice','touristbureau',
  'visitorsbureau','visitorsguide','travelguide','destinationguide',
  'convention-bureau','conventionbureau',
]

async function seed() {
  let added = 0, skipped = 0

  async function upsert(domain: string, label: string, matchType: string) {
    const res = await prisma.onboardingBlockedDomain.upsert({
      where: { domain },
      update: { label, matchType },  // update label/type if entry exists from manual add
      create: { domain, label, matchType, addedById: null },
    })
    if (res.addedById === null) added++
    else skipped++
  }

  for (const d of OTA_EXACT) {
    await upsert(d, `OTA / blocked site (seeded)`, 'subdomain')
  }
  for (const b of OTA_BRANDS) {
    await upsert(b, `OTA brand — blocks all TLDs (seeded)`, 'brand')
  }
  for (const k of OTA_KEYWORDS) {
    await upsert(k, `Keyword pattern — blocks any domain containing this (seeded)`, 'keyword')
  }

  console.log(`Done. Seeded ${added} entries, updated ${skipped} existing.`)
  await prisma.$disconnect()
}

seed().catch(e => { console.error(e); process.exit(1) })
