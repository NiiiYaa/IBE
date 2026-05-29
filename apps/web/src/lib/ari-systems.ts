// ARI sources HyperGuest does NOT yet have a connection for.
// Systems already in HG (from ARI_Source CSV + KB) are excluded.
// Source: b373c7f5-8cf2-48ad-b242-e4289bf95d18.csv + Zoho KB

export interface AriSystem {
  name: string
  category: 'PMS' | 'CM' | 'CRS'
}

export const ARI_SYSTEMS: AriSystem[] = [
  // ── Property Management Systems (not yet in HG) ────────────────────────────
  // Global Enterprise
  { name: 'Oracle OPERA 5 (Legacy On-Premises)',        category: 'PMS' },
  { name: 'Oracle Hospitality Suite8',                  category: 'PMS' },
  { name: 'Infor HMS',                                  category: 'PMS' },
  { name: 'Amadeus Cloud PMS',                          category: 'PMS' },
  { name: 'Agilysys Stay',                              category: 'PMS' },
  { name: 'Agilysys Visual One',                        category: 'PMS' },
  { name: 'Agilysys LMS',                               category: 'PMS' },
  { name: 'Sabre Hospitality Property Hub',             category: 'PMS' },
  { name: 'Sihot (Gubse AG)',                           category: 'PMS' },
  { name: 'Maestro PMS',                                category: 'PMS' },
  { name: 'Springer-Miller SMS|Host',                   category: 'PMS' },
  { name: 'IQware PMS',                                 category: 'PMS' },
  { name: 'Jonas Chorum (ChorumPM)',                    category: 'PMS' },
  // Modern Cloud
  { name: 'Stayntouch',                                 category: 'PMS' },
  { name: 'Clock PMS+',                                 category: 'PMS' },
  { name: 'HotelTime',                                  category: 'PMS' },
  { name: 'Jurny',                                      category: 'PMS' },
  { name: 'Base7booking',                               category: 'PMS' },
  // Independent & North America
  { name: 'ThinkReservations',                          category: 'PMS' },
  { name: 'ResNexus',                                   category: 'PMS' },
  { name: 'innRoad',                                    category: 'PMS' },
  { name: 'RezStream',                                  category: 'PMS' },
  { name: 'SkyTouch PMS',                               category: 'PMS' },
  { name: 'HotelKey',                                   category: 'PMS' },
  { name: 'AutoClerk (BWH)',                             category: 'PMS' },
  { name: 'Hotello',                                    category: 'PMS' },
  { name: 'InnSoft (Check-In Systems)',                 category: 'PMS' },
  { name: 'Frontdesk Anywhere',                         category: 'PMS' },
  { name: 'Skyware PMS',                                category: 'PMS' },
  { name: 'ResortSuite',                                category: 'PMS' },
  { name: 'Visual Matrix',                              category: 'PMS' },
  // Asia / Emerging Markets
  { name: 'Hotelogix',                                  category: 'PMS' },
  { name: 'IDS Next (FortuneNext)',                     category: 'PMS' },
  { name: 'WinHMS',                                     category: 'PMS' },
  { name: 'Cheerze Connect',                            category: 'PMS' },
  // Europe
  { name: 'Gastrodat',                                  category: 'PMS' },
  { name: 'ASA Hotel',                                  category: 'PMS' },
  { name: 'HotSoft (Hoist Group / Planet)',             category: 'PMS' },
  { name: 'Brilliant PMP',                              category: 'PMS' },
  // APAC / Africa
  { name: 'Newbook',                                    category: 'PMS' },
  { name: 'Seekom',                                     category: 'PMS' },
  { name: 'NightsBridge',                               category: 'PMS' },
  { name: 'ResRequest',                                 category: 'PMS' },
  { name: 'Sirvoy',                                     category: 'PMS' },
  // Alternative / Vacation Rental
  { name: 'Hostaway',                                   category: 'PMS' },
  { name: 'Lodgify',                                    category: 'PMS' },
  { name: 'Amenitiz',                                   category: 'PMS' },
  { name: 'Smoobu',                                     category: 'PMS' },
  { name: 'Hostfully',                                  category: 'PMS' },
  { name: 'Escapia (Expedia)',                          category: 'PMS' },
  { name: 'Streamline VRS',                             category: 'PMS' },
  { name: 'Track Hospitality Software',                 category: 'PMS' },
  { name: 'CiiRUS',                                     category: 'PMS' },
  { name: 'Barefoot VRM',                               category: 'PMS' },
  { name: 'RealTimeRental',                             category: 'PMS' },
  { name: 'Virtual Resort Manager (VRM)',               category: 'PMS' },
  { name: 'Tokeet',                                     category: 'PMS' },
  { name: 'Uplisting',                                  category: 'PMS' },
  { name: 'OwnerRez',                                   category: 'PMS' },
  { name: 'Avantio',                                    category: 'PMS' },
  { name: 'BookingSync',                                category: 'PMS' },
  { name: '365Villas',                                  category: 'PMS' },
  { name: 'Hostify',                                    category: 'PMS' },

  // ── Channel Managers (not yet in HG) ────────────────────────────────────────
  { name: 'BookingPal',                                 category: 'CM' },
  { name: 'RedAwning',                                  category: 'CM' },
  { name: 'Seekom Channel Manager',                     category: 'CM' },
  { name: 'NightsBridge Channel Manager',               category: 'CM' },
  { name: 'ResOnline (APAC)',                           category: 'CM' },
  { name: 'Neobooking',                                 category: 'CM' },
  { name: 'Mirai Distribution Engine',                  category: 'CM' },
  { name: 'Roiback Direct Connect',                     category: 'CM' },
  { name: 'Guestcentric Distribution',                  category: 'CM' },
  { name: 'Reservit',                                   category: 'CM' },

  // ── Central Reservation Systems (not yet in HG) ────────────────────────────
  { name: 'Amadeus iHotelier',                          category: 'CRS' },
  { name: 'Cendyn CRS (Pegasus / NextGuest / RezTrip)', category: 'CRS' },
  { name: 'Infor CRS',                                  category: 'CRS' },
  { name: 'Springer-Miller CRS',                        category: 'CRS' },
  { name: 'Maestro Multi-Property CRS',                 category: 'CRS' },
  { name: 'IQware CRS',                                 category: 'CRS' },
  { name: 'Agilysys rGuest Book Engine & CRS',         category: 'CRS' },
  { name: 'Guestcentric CRS',                           category: 'CRS' },
  { name: 'Roiback CRS',                                category: 'CRS' },
  { name: 'Mirai CRS',                                  category: 'CRS' },
  { name: 'RezNexus CRS',                               category: 'CRS' },
  { name: 'innRoad CRS',                                category: 'CRS' },
  { name: 'Bookassist CRS',                             category: 'CRS' },
  { name: 'Neobooking CRS',                             category: 'CRS' },
  { name: 'Seekom CRS',                                 category: 'CRS' },
  { name: 'ResRequest CRS',                             category: 'CRS' },
  { name: 'Hotelogix CRS',                              category: 'CRS' },
  { name: 'Avvio (Allo CRS)',                           category: 'CRS' },
  { name: 'IBC Hotels CRS',                             category: 'CRS' },
  { name: 'InnLink CRS',                                category: 'CRS' },
]

export const CATEGORY_LABELS: Record<AriSystem['category'], string> = {
  PMS: 'Property Management Systems (PMS)',
  CM:  'Channel Managers (CM)',
  CRS: 'Central Reservation Systems (CRS)',
}
