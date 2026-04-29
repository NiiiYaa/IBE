// Checked in order — SPECIFIC patterns must come before GENERAL ones that would
// otherwise match first (e.g. "front desk" before "desk", "TV area" before "lounge").
const ICONS: Array<[RegExp, string]> = [

  // ── Hotel services (specific phrases first) ──────────────────────────────────
  [/24.hour|front desk|reception/i,          '🕐'],   // before "desk"
  [/room service/i,                          '🛎️'],
  [/wake up service|wake-up/i,               '⏰'],
  [/concierge|porter|bell/i,                 '🎩'],
  [/shuttle|airport transfer/i,              '🚌'],
  [/bicycle|bike rental/i,                   '🚲'],
  [/laundry|dry.clean/i,                     '👕'],
  [/elevator|lift/i,                         '🛗'],
  [/parking|garage|car park/i,               '🅿️'],
  [/business cent|meeting room|conference/i, '💼'],
  [/tour desk|ticket/i,                      '🗺️'],
  [/atm|currency.exchange/i,                 '💱'],
  [/library|reading room/i,                  '📚'],
  [/rooftop/i,                               '🌆'],
  [/casino/i,                                '🎰'],
  [/golf/i,                                  '⛳'],
  [/tennis/i,                                '🎾'],
  [/ski/i,                                   '⛷️'],
  [/pet.friendly|dogs? allowed/i,            '🐾'],
  [/children|kids club|playground/i,         '👨‍👩‍👧'],
  [/wheelchair|accessible|disability/i,      '♿'],
  [/non.smok/i,                              '🚭'],
  [/entire property on ground/i,             '♿'],

  // ── Pool & Beach ─────────────────────────────────────────────────────────────
  [/pool view/i,                             '🌊'],   // before "pool"
  [/pool|swimming|aqua/i,                    '🏊'],
  [/hot tub|spa bath|jacuzzi|whirlpool/i,    '🛁'],
  [/beach|sea access/i,                      '🏖️'],

  // ── Wellness ─────────────────────────────────────────────────────────────────
  [/spa|wellness|massage|beauty salon/i,     '🧖'],
  [/sauna|steam room/i,                      '🌡️'],
  [/gym|fitness|workout/i,                   '💪'],

  // ── Food & Drink ─────────────────────────────────────────────────────────────
  [/restaurant|bistro|brasserie/i,           '🍽️'],
  [/dining area|dining table|outdoor dining/i, '🍽️'], // before "dining" catch-all
  [/snack bar/i,                             '🥨'],   // before generic "bar"
  [/minibar|mini.bar/i,                      '🍾'],   // before generic "bar"
  [/shared lounge|tv area|lounge.area/i,     '🛋️'],   // before generic "bar/lounge"
  [/bar|pub|cocktail|lounge/i,               '🍸'],
  [/cafe|coffee shop|tea room/i,             '☕'],
  [/coffee maker|coffee machine|nespresso|kettle/i, '☕'],
  [/breakfast/i,                             '🥐'],
  [/microwave/i,                             '🫙'],
  [/dishwasher/i,                            '🫧'],
  [/oven/i,                                  '🔥'],
  [/stove/i,                                 '🍳'],
  [/kitchenware/i,                           '🍴'],   // before "kitchen"
  [/kitchen|kitchenette/i,                   '🍳'],
  [/refrigerator|fridge/i,                   '🧊'],

  // ── Room features ────────────────────────────────────────────────────────────
  [/air.con|climate control/i,               '❄️'],
  [/heating|heater/i,                        '🔥'],
  [/fan/i,                                   '🌀'],
  [/tv|television|cable/i,                   '📺'],
  [/desk|work.space/i,                       '📋'],
  [/seating area|seat/i,                     '🛋️'],   // before "sofa"
  [/sofa bed/i,                              '🛋️'],
  [/sofa|couch/i,                            '🛋️'],
  [/outdoor furniture/i,                     '🪑'],
  [/wardrobe|closet/i,                       '🚪'],
  [/private entrance/i,                      '🚪'],
  [/iron|ironing/i,                          '👔'],
  [/telephone|phone/i,                       '📞'],
  [/alarm clock/i,                           '⏰'],
  [/safe deposit|safe/i,                     '🔒'],
  [/balcony/i,                               '🏙️'],
  [/terrace|patio/i,                         '🌿'],
  [/garden view|garden/i,                    '🌿'],
  [/view/i,                                  '🌅'],   // generic view fallback
  [/wi-fi|wifi|internet|wireless/i,          '📶'],

  // ── Bathroom ─────────────────────────────────────────────────────────────────
  [/free toiletries|toiletries|amenity kit/i, '🧴'],  // before "toilet"
  [/additional bathroom|private bathroom|shared bathroom/i, '🚿'], // before "bathroom"
  [/shower/i,                                '🚿'],
  [/bathtub|bath tub/i,                      '🛁'],
  [/toilet/i,                                '🚽'],
  [/shampoo|conditioner/i,                   '🧴'],
  [/soap/i,                                  '🧼'],
  [/towel/i,                                 '🧺'],
  [/slipper/i,                               '🩴'],
  [/bathrobe|robe/i,                         '🧥'],
  [/hair dryer|hairdryer|hair drier/i,       '💨'],
]

export function facilityIcon(name: string): string {
  for (const [pattern, icon] of ICONS) {
    if (pattern.test(name)) return `${icon} `
  }
  return ''
}
