import { detectKnownIBE, normaliseBoard } from '@ibe/shared';
import { withStealthPage } from '../playwright-browser.service.js';
import { lookupTaxes } from '../tax-lookup.service.js';
import { parseCancellationPolicy } from './cancellation-policy-parser.js';
import type {
  HarvestedHotelData, HarvestedRoom, DiscoveredRatePlanType, HarvestedOccupancy,
} from '@ibe/onboarding-flows';
import type { IbeHarvester, HarvestContext } from './types.js';

// ── Selector constants — update with findings from DOM investigation on real SynXis hotel ──
// Note: be.synxis.com is IP-blocked from dev. These placeholders cover common React SPA patterns.
// Tune after first deployment on Render.com.
const SELECTORS = {
  roomCard:    '[data-testid*="room"], [class*="RoomCard"], [class*="room-card"], [class*="SearchResult"]',
  roomName:    '[data-testid*="room-name"], [class*="RoomName"], h3, h4',
  roomDesc:    '[data-testid*="room-desc"], [class*="RoomDesc"], [class*="description"] p',
  roomImage:   'img[src*="images"], img[src*="photo"], img[src*="room"]',
  rateOption:  '[data-testid*="rate"], [class*="RateOption"], [class*="rate-item"], [class*="Rate"]',
  boardLabel:  '[data-testid*="board"], [class*="BoardType"], [class*="meal-plan"], [class*="MealPlan"]',
  cancelText:  '[data-testid*="cancel"], [class*="CancelPolicy"], [class*="refund"], [class*="Refund"]',
  hotelName:   '[data-testid*="hotel-name"], [class*="PropertyName"], [class*="HotelName"], h1',
  amenityItem: '[data-testid*="amenity"], [class*="Amenity"], [class*="amenity"] li',
};


// Occupancy patterns: [adults, children, childAge]
const OCCUPANCY_PATTERNS: [number, number, number][] = [
  [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0],
  [2, 1, 8], [2, 2, 8],
];

const DATE_WINDOWS_OFFSETS = [7, 30]; // days from today

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildSynXisUrl(
  template: string, hotelId: string,
  adults: number, children: number, childAge: number,
  checkIn: string, checkOut: string,
): string {
  let url = template
    .replace('{externalHotelId}', hotelId)
    .replace('{adults}', String(adults))
    .replace('{checkIn}', checkIn)
    .replace('{checkOut}', checkOut)
    .replace('{currency}', 'USD')
    .replace('child=0', `child=${children}`);
  if (children > 0) {
    url += `&childAge[]=${childAge}`.repeat(children);
  }
  return url;
}

interface RawRateOption { boardLabel: string; cancelText: string; price: string }
interface RawRoomCard {
  name: string; description: string; images: string[];
  bedConfiguration: string; amenities: string[]; rateOptions: RawRateOption[];
}

type HotelInfoResult = Omit<HarvestedHotelData, 'rooms' | 'discoveredRatePlanTypes' | 'agePolicy' | 'taxesAndFees'>;

export class SynXisHarvester implements IbeHarvester {
  async harvest(ibeUrl: string, ctx: HarvestContext, onProgress: (m: string) => void): Promise<HarvestedHotelData> {
    const detected = detectKnownIBE(ibeUrl);
    if (!detected) throw new Error('Not a recognised SynXis URL');

    const template = detected.searchTemplate;
    const hotelId = detected.externalHotelId;

    onProgress('Extracting hotel information...');
    const hotelInfo = await this.extractHotelInfo(template, hotelId, ctx);

    onProgress('Discovering room types and rate plans...');
    const roomsMap = new Map<string, HarvestedRoom>();
    const ratePlanMap = new Map<string, DiscoveredRatePlanType>();

    for (const offsetDays of DATE_WINDOWS_OFFSETS) {
      const checkIn = addDays(offsetDays);
      const checkOut = addDays(offsetDays + 1);
      let consecutiveEmpty = 0;

      for (const [adults, children, childAge] of OCCUPANCY_PATTERNS) {
        const searchUrl = buildSynXisUrl(template, hotelId, adults, children, childAge, checkIn, checkOut);
        onProgress(`Searching ${adults}A${children > 0 ? `+${children}C` : ''} (${offsetDays}d out)...`);

        const cards = await this.scrapeRoomCards(searchUrl, adults, children);
        let foundNew = false;

        for (const card of cards) {
          if (!roomsMap.has(card.name)) {
            foundNew = true;
            roomsMap.set(card.name, {
              name: card.name,
              description: card.description,
              images: card.images,
              bedConfiguration: card.bedConfiguration || null,
              amenities: card.amenities,
              supportedOccupancies: [{ adults, children }],
              maxAdults: adults,
              maxOccupancy: adults + children,
            });
          } else {
            const existing = roomsMap.get(card.name)!;
            const occ: HarvestedOccupancy = { adults, children };
            if (!existing.supportedOccupancies.some(o => o.adults === adults && o.children === children)) {
              existing.supportedOccupancies.push(occ);
              existing.maxAdults = Math.max(existing.maxAdults ?? 0, adults);
              existing.maxOccupancy = Math.max(existing.maxOccupancy ?? 0, adults + children);
            }
          }

          for (const rate of card.rateOptions) {
            const boardCode = normaliseBoard(rate.boardLabel);
            if (!boardCode) continue;
            const isNR = /non.?refund/i.test(rate.cancelText);
            const key = `${boardCode}:${isNR ? 'NR' : 'R'}`;
            if (!ratePlanMap.has(key)) {
              ratePlanMap.set(key, {
                boardCode,
                boardCodeRawName: rate.boardLabel,
                hasRefundable: !isNR,
                hasNonRefundable: isNR,
                refundableCancellationPolicy: isNR ? null : parseCancellationPolicy(rate.cancelText),
                refundableExampleName: isNR ? null : rate.boardLabel,
                nonRefundableExampleName: isNR ? rate.boardLabel : null,
              });
            } else {
              const existing = ratePlanMap.get(key)!;
              if (!isNR) existing.hasRefundable = true;
              else existing.hasNonRefundable = true;
            }
          }
        }

        if (!foundNew) consecutiveEmpty++;
        else consecutiveEmpty = 0;
        if (consecutiveEmpty >= 3) break; // early-stop: 3 consecutive empty passes
      }
    }

    onProgress('Running age sweep...');
    const agePolicy = await this.runAgeSweep(template, hotelId, ctx);

    onProgress('Looking up taxes...');
    const taxesAndFees = lookupTaxes(hotelInfo.country ?? '', hotelInfo.city ?? '');

    return {
      ...hotelInfo,
      rooms: Array.from(roomsMap.values()),
      discoveredRatePlanTypes: Array.from(ratePlanMap.values()),
      agePolicy,
      taxesAndFees,
    };
  }

  private async extractHotelInfo(template: string, hotelId: string, ctx: HarvestContext): Promise<HotelInfoResult> {
    const url = buildSynXisUrl(template, hotelId, 2, 0, 0, ctx.checkIn, ctx.checkOut);
    return withStealthPage(url, async (page) => {
      await page.waitForTimeout(3000);
      return page.evaluate((sel: typeof SELECTORS): HotelInfoResult => {
        const name = document.querySelector(sel.hotelName)?.textContent?.trim() ?? '';
        const images = Array.from(document.querySelectorAll(sel.roomImage) as NodeListOf<HTMLImageElement>)
          .map(img => img.src).filter(s => s.startsWith('http')).slice(0, 10);
        const amenities = Array.from(document.querySelectorAll(sel.amenityItem))
          .map(el => (el as HTMLElement).textContent?.trim() ?? '').filter(Boolean).slice(0, 20);
        const address = document.querySelector('[itemprop="streetAddress"]')?.textContent?.trim()
          ?? document.querySelector('[class*="address"], [class*="Address"]')?.textContent?.trim()
          ?? null;
        const desc = document.querySelector('[class*="description"], [class*="Description"]')
          ?.textContent?.trim()?.slice(0, 500) ?? '';
        return {
          name, starRating: null, address, city: null, country: null,
          phone: null, email: null, website: null,
          description: desc, images, amenities, policies: [],
        };
      }, SELECTORS);
    }, { idleTimeout: 8000 });
  }

  private async scrapeRoomCards(url: string, adults: number, children: number): Promise<RawRoomCard[]> {
    try {
      return await withStealthPage(url, async (page) => {
        try { await page.waitForSelector(SELECTORS.roomCard, { timeout: 15000 }); } catch { /* timeout ok */ }
        await page.waitForTimeout(2000);
        return page.evaluate((sel: typeof SELECTORS): RawRoomCard[] => {
          return Array.from(document.querySelectorAll(sel.roomCard)).map(card => {
            const name = card.querySelector(sel.roomName)?.textContent?.trim() ?? 'Unknown Room';
            const description = card.querySelector(sel.roomDesc)?.textContent?.trim() ?? '';
            const images = Array.from(card.querySelectorAll(sel.roomImage) as NodeListOf<HTMLImageElement>)
              .map(img => img.src).filter(s => s.startsWith('http'));
            const bedMatch = (card as HTMLElement).innerText?.match(/\d+\s+(king|queen|twin|single|double)\s+bed/i);
            const amenities: string[] = [];
            const rateOptions = Array.from(card.querySelectorAll(sel.rateOption)).map(rate => ({
              boardLabel: rate.querySelector(sel.boardLabel)?.textContent?.trim() ?? '',
              cancelText: rate.querySelector(sel.cancelText)?.textContent?.trim() ?? '',
              price: rate.querySelector('[class*="price"], [class*="Price"]')?.textContent?.trim() ?? '',
            })).filter(r => r.boardLabel);
            return { name, description, images, bedConfiguration: bedMatch?.[0] ?? '', amenities, rateOptions };
          }).filter(r => r.name !== 'Unknown Room' && r.rateOptions.length > 0);
        }, SELECTORS);
      }, { navigationTimeout: 20000, idleTimeout: 8000 });
    } catch {
      return []; // navigation error → treated as empty → early-stop kicks in
    }
  }

  private async runAgeSweep(template: string, hotelId: string, ctx: HarvestContext) {
    const prices: number[] = [];
    for (let age = 0; age <= 17; age++) {
      const url = buildSynXisUrl(template, hotelId, 2, 1, age, ctx.checkIn, ctx.checkOut);
      try {
        const price = await withStealthPage(url, async (page) => {
          await page.waitForTimeout(2000);
          return page.evaluate((): number | null => {
            const el = document.querySelector('[class*="total"], [class*="Total"], [class*="price"]');
            const text = el?.textContent?.replace(/[^0-9.]/g, '') ?? '';
            return text ? parseFloat(text) : null;
          }) as Promise<number | null>;
        }, { idleTimeout: 6000 });
        prices.push(price ?? 0);
      } catch {
        prices.push(0);
      }
    }

    // Find age bracket boundaries where price changes significantly (>5%)
    const categories = [];
    let bracketStart = 0;
    for (let i = 1; i <= 17; i++) {
      const prev = prices[i - 1] ?? 0;
      const curr = prices[i] ?? 0;
      const changed = prev > 0 && curr > 0 && Math.abs(curr - prev) / prev > 0.05;
      if (changed || i === 17) {
        categories.push({
          name: `Child (${bracketStart}-${i === 17 ? 17 : i - 1})`,
          minAge: bracketStart,
          maxAge: i - 1,
        });
        bracketStart = i;
      }
    }
    if (categories.length === 0) return null;

    return {
      categories,
      hasTieredChildPricing: categories.length > 1,
      source: 'price_sweep' as const,
      rawText: null,
    };
  }
}
