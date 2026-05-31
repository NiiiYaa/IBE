export interface AriSystem {
  name: string
  category: 'PMS' | 'CM' | 'CRS'
}

export type AriSourceOption =
  | { kind: 'hg_has';      pmsId: number; name: string }
  | { kind: 'to_be_added'; name: string; category: 'PMS' | 'CM' | 'CRS' }

export type AriSelection =
  | { kind: 'hg_has';       pmsId: number; name: string }
  | { kind: 'to_be_added';  name: string }
  | { kind: 'to_be_checked'; name: string }

export const CATEGORY_LABELS: Record<AriSystem['category'], string> = {
  PMS: 'Property Management Systems (PMS)',
  CM:  'Channel Managers (CM)',
  CRS: 'Central Reservation Systems (CRS)',
}

export function getAriSourceList(
  vendorFlows: ReadonlyArray<{ pmsId: number; pmsName: string }>,
): AriSourceOption[] {
  const hg: AriSourceOption[] = [...vendorFlows]
    .sort((a, b) => a.pmsName.localeCompare(b.pmsName))
    .map(f => ({ kind: 'hg_has' as const, pmsId: f.pmsId, name: f.pmsName }))
  const toAdd: AriSourceOption[] = ARI_SYSTEMS.map(s => ({ kind: 'to_be_added' as const, name: s.name, category: s.category }))
  return [...hg, ...toAdd]
}

export const ARI_SYSTEMS: AriSystem[] = [
  // ── Property Management Systems ────────────────────────────────────────────
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
  { name: 'Stayntouch',                                 category: 'PMS' },
  { name: 'Clock PMS+',                                 category: 'PMS' },
  { name: 'HotelTime',                                  category: 'PMS' },
  { name: 'Jurny',                                      category: 'PMS' },
  { name: 'Base7booking',                               category: 'PMS' },
  { name: 'ThinkReservations',                          category: 'PMS' },
  { name: 'ResNexus',                                   category: 'PMS' },
  { name: 'innRoad',                                    category: 'PMS' },
  { name: 'RezStream',                                  category: 'PMS' },
  { name: 'SkyTouch PMS',                               category: 'PMS' },
  { name: 'HotelKey',                                   category: 'PMS' },
  { name: 'AutoClerk (BWH)',                            category: 'PMS' },
  { name: 'Hotello',                                    category: 'PMS' },
  // ── Channel Managers ───────────────────────────────────────────────────────
  { name: 'Rentals United',                             category: 'CM' },
  { name: 'MyAllocator (Cloudbeds CM)',                 category: 'CM' },
  { name: 'Seekda',                                     category: 'CM' },
  { name: 'Lodgify',                                    category: 'CM' },
  { name: 'Smoobu',                                     category: 'CM' },
  { name: 'Beds24',                                     category: 'CM' },
  { name: 'iGMS',                                       category: 'CM' },
  { name: 'Hostaway',                                   category: 'CM' },
  { name: 'Guesty',                                     category: 'CM' },
  { name: 'BookingSync (Smily)',                        category: 'CM' },
  { name: 'Kigo',                                       category: 'CM' },
  { name: 'CiiRUS',                                     category: 'CM' },
  { name: 'Track (formerly Barefoot)',                  category: 'CM' },
  { name: 'Hostfully',                                  category: 'CM' },
  { name: 'Tokeet',                                     category: 'CM' },
  { name: 'Avantio',                                    category: 'CM' },
  { name: 'Octorate',                                   category: 'CM' },
  { name: 'Hotel Res Bot',                              category: 'CM' },
  { name: 'Cultuzz (CultSwitch)',                       category: 'CM' },
  { name: 'Siteminder (for CM only use)',               category: 'CM' },
  { name: 'Hoteliga',                                   category: 'CM' },
  { name: 'BookingExperts',                             category: 'CM' },
  { name: 'Amenitiz',                                   category: 'CM' },
  { name: 'NewBook',                                    category: 'CM' },
  { name: 'Little Hotelier',                            category: 'CM' },
  { name: 'Cloudbeds (direct)',                         category: 'CM' },
  { name: 'ResRequest',                                 category: 'CM' },
  { name: 'Sirvoy',                                     category: 'CM' },
  { name: 'RoomKeyPMS',                                 category: 'CM' },
  { name: 'Lodgical Solution',                          category: 'CM' },
  { name: 'WebRezPro',                                  category: 'CM' },
  { name: 'Frontdesk Anywhere',                         category: 'CM' },
  { name: 'Hotelogix',                                  category: 'CM' },
  { name: 'Protel (by Planet)',                         category: 'CM' },
  { name: 'Fidelio Suite8',                             category: 'CM' },
  { name: 'Preno',                                      category: 'CM' },
  { name: 'Brilliant Hotel Software',                   category: 'CM' },
  { name: 'Guestline',                                  category: 'CM' },
  { name: 'Quovis',                                     category: 'CM' },
  { name: 'Fastbooking (DIRS21)',                       category: 'CM' },
  { name: 'DIRS21',                                     category: 'CM' },
  { name: 'Reservit',                                   category: 'CM' },
  // ── Central Reservation Systems ────────────────────────────────────────────
  { name: 'Amadeus iHotelier',                          category: 'CRS' },
  { name: 'Cendyn CRS (Pegasus / NextGuest / RezTrip)', category: 'CRS' },
  { name: 'Infor CRS',                                  category: 'CRS' },
  { name: 'Springer-Miller CRS',                        category: 'CRS' },
  { name: 'Maestro Multi-Property CRS',                 category: 'CRS' },
  { name: 'IQware CRS',                                 category: 'CRS' },
  { name: 'Agilysys rGuest Book Engine & CRS',          category: 'CRS' },
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
