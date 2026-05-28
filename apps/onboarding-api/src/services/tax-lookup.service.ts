import type { HarvestedFee } from '@ibe/onboarding-flows';

interface CountryTaxEntry {
  vatRate: string;
  vatName: string;
  cities?: Record<string, { name: string; amount: string; notes: string }>;
}

const TAX_DATA: Record<string, CountryTaxEntry> = {
  'Netherlands': {
    vatRate: '9%', vatName: 'VAT',
    cities: {
      'Amsterdam': { name: 'Tourist tax', amount: '12.5% of room rate', notes: 'City tourist tax (toeristenbelasting), applied per night' },
      'Rotterdam': { name: 'Tourist tax', amount: '8% of room rate', notes: 'City tourist tax' },
      'The Hague': { name: 'Tourist tax', amount: '5.5% of room rate', notes: 'City tourist tax' },
    },
  },
  'France': {
    vatRate: '10%', vatName: 'TVA',
    cities: {
      'Paris': { name: 'Tourist tax (Taxe de séjour)', amount: '€5.20–€14.95/person/night', notes: 'Varies by star rating' },
      'Nice': { name: 'Tourist tax (Taxe de séjour)', amount: '€3.30/person/night', notes: 'Applies to all guests' },
    },
  },
  'Germany': {
    vatRate: '7%', vatName: 'VAT',
    cities: {
      'Berlin': { name: 'City tax (Kurtaxe / Übernachtungsteuer)', amount: '5% of net room rate', notes: 'Business travellers can be exempt with employer invoice' },
      'Hamburg': { name: 'City tax (Kulturförderabgabe)', amount: '5% of net room rate', notes: 'Exempt for business stays with employer invoice' },
      'Munich': { name: 'Kurtaxe', amount: '€3.50/person/night', notes: 'Applies per guest per night' },
    },
  },
  'United Kingdom': { vatRate: '20%', vatName: 'VAT' },
  'Spain': {
    vatRate: '10%', vatName: 'IVA',
    cities: {
      'Barcelona': { name: 'Tourist tax (Taxa turística)', amount: '€4.40/person/night', notes: '€2.25 city tax + €2.15 Catalonia regional tax' },
    },
  },
  'Italy': {
    vatRate: '10%', vatName: 'IVA',
    cities: {
      'Rome': { name: 'Tourist tax (Tassa di soggiorno)', amount: '€3–€7/person/night', notes: 'Varies by hotel category; exempt for children under 10' },
      'Venice': { name: 'Tourist tax (Contributo di accesso)', amount: '€3–€10/person/night', notes: 'Higher rates for peak dates' },
      'Florence': { name: 'Tourist tax', amount: '€4/person/night', notes: 'Per adult per night' },
      'Milan': { name: 'Tourist tax', amount: '€2–€5/person/night', notes: 'Varies by hotel category' },
    },
  },
  'Greece': { vatRate: '13%', vatName: 'VAT' },
  'Portugal': {
    vatRate: '6%', vatName: 'IVA',
    cities: {
      'Lisbon': { name: 'Tourist tax', amount: '€2/person/night', notes: 'Max 7 nights; exempt for children under 13' },
      'Porto': { name: 'Tourist tax', amount: '2% of stay (min €2, max €2/night)', notes: 'Applied per stay' },
    },
  },
  'Austria': {
    vatRate: '13%', vatName: 'MwSt',
    cities: {
      'Vienna': { name: 'Ortstaxe', amount: '3.2% of room rate', notes: 'Municipal accommodation tax' },
    },
  },
  'Switzerland': {
    vatRate: '3.8%', vatName: 'MWST',
    cities: {
      'Zurich': { name: 'Tourist tax (Kurtaxe)', amount: 'CHF 2.50–7.00/person/night', notes: 'Varies by area within the city' },
      'Geneva': { name: 'Tourist tax', amount: 'CHF 3.30/person/night', notes: 'Applies per adult guest per night' },
    },
  },
  'United States': {
    vatRate: 'N/A', vatName: 'Sales tax varies by state',
    cities: {
      'New York City': { name: 'Hotel tax', amount: '14.75% + $3.50/night', notes: '8.875% sales tax + 5.875% city tax + $3.50 NYC tax per night' },
      'Las Vegas': { name: 'Hotel tax', amount: '13.38%', notes: 'State + county lodging tax; resort fees extra' },
      'Los Angeles': { name: 'Transient occupancy tax', amount: '14%', notes: 'City tax; plus sales tax ~10%' },
      'Miami': { name: 'Hotel tax', amount: '13%', notes: 'State + county; resort fees charged separately' },
    },
  },
  'United Arab Emirates': {
    vatRate: '5%', vatName: 'VAT',
    cities: {
      'Dubai': { name: 'Tourism Dirham fee', amount: 'AED 7–20/room/night', notes: 'AED 7/night (hotel), AED 10 (4-star), AED 20 (5-star); plus 5% VAT and 10% municipality fee' },
      'Abu Dhabi': { name: 'Tourist facility tax', amount: '4% of room rate', notes: 'Plus VAT; charged by municipality' },
    },
  },
  'Thailand': { vatRate: '7%', vatName: 'VAT' },
  'Indonesia': {
    vatRate: '11%', vatName: 'PPN',
    cities: {
      'Bali': { name: 'Hotel and restaurant tax (PHRI)', amount: '10% of room rate', notes: 'Plus VAT; regional accommodation tax' },
    },
  },
  'Australia': { vatRate: '10%', vatName: 'GST' },
  'Singapore': {
    vatRate: '9%', vatName: 'GST',
    cities: {
      'Singapore': { name: 'Tourism cess', amount: '1% of room rate', notes: 'Plus GST' },
    },
  },
};

function normalise(s: string) {
  return s.toLowerCase().trim();
}

export function lookupTaxes(country: string, city: string): HarvestedFee[] {
  const entry = Object.entries(TAX_DATA).find(([k]) => normalise(k) === normalise(country));
  if (!entry) return [];

  const [, data] = entry;
  const fees: HarvestedFee[] = [];

  if (data.vatRate !== 'N/A') {
    fees.push({
      name: data.vatName,
      amount: data.vatRate,
      notes: `Standard accommodation tax rate for ${country}`,
      source: 'lookup',
    });
  }

  if (data.cities) {
    const cityEntry = Object.entries(data.cities).find(([k]) => normalise(k) === normalise(city));
    if (cityEntry) {
      const [, cityTax] = cityEntry;
      fees.push({
        name: cityTax.name,
        amount: cityTax.amount,
        notes: cityTax.notes,
        source: 'lookup',
      });
    }
  }

  return fees;
}
