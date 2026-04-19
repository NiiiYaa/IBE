interface CurrencyMeta { name: string; symbol: string }

const CURRENCIES: Record<string, CurrencyMeta> = {
  AED: { name: 'UAE Dirham',          symbol: 'د.إ' },
  ARS: { name: 'Argentine Peso',      symbol: '$'   },
  AUD: { name: 'Australian Dollar',   symbol: 'A$'  },
  BGN: { name: 'Bulgarian Lev',       symbol: 'лв'  },
  BRL: { name: 'Brazilian Real',      symbol: 'R$'  },
  CAD: { name: 'Canadian Dollar',     symbol: 'C$'  },
  CHF: { name: 'Swiss Franc',         symbol: 'Fr'  },
  CLP: { name: 'Chilean Peso',        symbol: '$'   },
  CNY: { name: 'Chinese Yuan',        symbol: '¥'   },
  CZK: { name: 'Czech Koruna',        symbol: 'Kč'  },
  DKK: { name: 'Danish Krone',        symbol: 'kr'  },
  EGP: { name: 'Egyptian Pound',      symbol: '£'   },
  EUR: { name: 'Euro',                symbol: '€'   },
  GBP: { name: 'Pound Sterling',      symbol: '£'   },
  HKD: { name: 'Hong Kong Dollar',    symbol: 'HK$' },
  HUF: { name: 'Hungarian Forint',    symbol: 'Ft'  },
  IDR: { name: 'Indonesian Rupiah',   symbol: 'Rp'  },
  ILS: { name: 'Israeli Shekel',      symbol: '₪'   },
  INR: { name: 'Indian Rupee',        symbol: '₹'   },
  JPY: { name: 'Japanese Yen',        symbol: '¥'   },
  KRW: { name: 'South Korean Won',    symbol: '₩'   },
  KWD: { name: 'Kuwaiti Dinar',       symbol: 'KD'  },
  MAD: { name: 'Moroccan Dirham',     symbol: 'د.م' },
  MXN: { name: 'Mexican Peso',        symbol: '$'   },
  MYR: { name: 'Malaysian Ringgit',   symbol: 'RM'  },
  NOK: { name: 'Norwegian Krone',     symbol: 'kr'  },
  NZD: { name: 'New Zealand Dollar',  symbol: 'NZ$' },
  OMR: { name: 'Omani Rial',          symbol: 'ر.ع' },
  PHP: { name: 'Philippine Peso',     symbol: '₱'   },
  PLN: { name: 'Polish Złoty',        symbol: 'zł'  },
  QAR: { name: 'Qatari Riyal',        symbol: 'ر.ق' },
  RON: { name: 'Romanian Leu',        symbol: 'lei' },
  RUB: { name: 'Russian Ruble',       symbol: '₽'   },
  SAR: { name: 'Saudi Riyal',         symbol: '﷼'   },
  SEK: { name: 'Swedish Krona',       symbol: 'kr'  },
  SGD: { name: 'Singapore Dollar',    symbol: 'S$'  },
  THB: { name: 'Thai Baht',           symbol: '฿'   },
  TRY: { name: 'Turkish Lira',        symbol: '₺'   },
  TWD: { name: 'Taiwan Dollar',       symbol: 'NT$' },
  USD: { name: 'US Dollar',           symbol: '$'   },
  ZAR: { name: 'South African Rand',  symbol: 'R'   },
}

/** Currencies shown at the top of the dropdown, before the full alphabetical list. */
export const TOP_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'AED', 'AUD', 'CAD']

export function currencyName(code: string): string {
  return CURRENCIES[code]?.name ?? code
}

export function currencySymbol(code: string): string {
  return CURRENCIES[code]?.symbol ?? code
}

/** All known currency codes, sorted alphabetically. */
export const ALL_CURRENCIES = Object.keys(CURRENCIES).sort()
