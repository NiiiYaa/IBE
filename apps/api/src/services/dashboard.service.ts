import { prisma } from '../db/client.js'
import type { DashboardStats, DashboardDayStat, DashboardChannelStat } from '@ibe/shared'

const AI_CHANNELS = ['aiSearchBar', 'whatsapp', 'mcp'] as const

function dateRange(days: number): { from: Date; to: Date; dates: string[] } {
  const to = new Date()
  to.setHours(23, 59, 59, 999)
  const from = new Date()
  from.setDate(from.getDate() - (days - 1))
  from.setHours(0, 0, 0, 0)

  const dates: string[] = []
  const cur = new Date(from)
  while (cur <= to) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return { from, to, dates }
}

export async function getDashboardStats(
  organizationId: number | null,
  days = 14,
  propertyId?: number | null,
): Promise<DashboardStats> {
  const { from, to, dates } = dateRange(days)

  // Resolve the set of property IDs to filter on
  // Priority: specific propertyId > org scope > all (super)
  let scopedPropertyIds: number[] | null

  if (propertyId != null) {
    scopedPropertyIds = [propertyId]
  } else if (organizationId !== null) {
    scopedPropertyIds = (await prisma.property.findMany({ where: { organizationId, deletedAt: null }, select: { propertyId: true } })).map(p => p.propertyId)
  } else {
    scopedPropertyIds = null
  }

  const propertyIdFilter = scopedPropertyIds !== null
    ? { propertyId: { in: scopedPropertyIds } }
    : {}

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // ── Bookings ──────────────────────────────────────────────────────────────

  const [bookings, bookingsToday] = await Promise.all([
    prisma.booking.findMany({
      where: { createdAt: { gte: from, lte: to }, ...propertyIdFilter },
      select: {
        createdAt: true, totalAmount: true, currency: true, status: true, searchId: true,
        checkIn: true, checkOut: true,
        rooms: { select: { id: true } },
      },
    }),
    prisma.booking.count({
      where: { createdAt: { gte: todayStart }, ...propertyIdFilter },
    }),
  ])

  // Derive currency from most common booking currency (or USD fallback)
  const currencyCount: Record<string, number> = {}
  for (const b of bookings) {
    currencyCount[b.currency] = (currencyCount[b.currency] ?? 0) + 1
  }
  const currency = Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD'

  const revenueTotal = bookings.reduce((s, b) => s + Number(b.totalAmount), 0)
  const revenueToday = bookings
    .filter(b => b.createdAt >= todayStart)
    .reduce((s, b) => s + Number(b.totalAmount), 0)

  const totalRoomNights = bookings.reduce((s, b) => {
    const nights = Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000)
    return s + (b.rooms.length || 1) * Math.max(nights, 1)
  }, 0)
  const adr = totalRoomNights > 0 ? Math.round((revenueTotal / totalRoomNights) * 100) / 100 : null

  const statusMap: Record<string, number> = {}
  for (const b of bookings) {
    statusMap[b.status] = (statusMap[b.status] ?? 0) + 1
  }
  const bookingsByStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }))

  // Booking searchId set for conversion lookup
  const convertedSearchIds = new Set(bookings.map(b => b.searchId).filter(Boolean) as string[])

  // ── Visitors ──────────────────────────────────────────────────────────────

  const visits = await prisma.iBEVisit.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      ...(scopedPropertyIds !== null ? { propertyId: { in: scopedPropertyIds } } : {}),
    },
    select: { sessionId: true, page: true, device: true },
  })

  // Unique visitors = distinct sessionIds
  const visitorsTotal = new Set(visits.map(v => v.sessionId)).size

  // Visitors per page = distinct sessionIds per page
  const pageSessionMap: Record<string, Set<string>> = {}
  for (const v of visits) {
    const s = pageSessionMap[v.page] ?? (pageSessionMap[v.page] = new Set())
    s.add(v.sessionId)
  }
  const visitorsByPage = Object.entries(pageSessionMap)
    .map(([page, sessions]) => ({ page, visitors: sessions.size }))
    .sort((a, b) => b.visitors - a.visitors)

  // Device breakdown — one device per session (first seen)
  const deviceSessionMap: Record<string, Set<string>> = {}
  for (const v of visits) {
    const d = deviceSessionMap[v.device] ?? (deviceSessionMap[v.device] = new Set())
    d.add(v.sessionId)
  }
  const DEVICE_ORDER = ['mobile', 'tablet', 'desktop']
  const visitorsByDevice = Object.entries(deviceSessionMap)
    .map(([device, sessions]) => ({ device, visitors: sessions.size }))
    .sort((a, b) => DEVICE_ORDER.indexOf(a.device) - DEVICE_ORDER.indexOf(b.device))

  // ── Search Sessions ───────────────────────────────────────────────────────

  const sessions = await prisma.searchSession.findMany({
    where: { createdAt: { gte: from, lte: to }, ...propertyIdFilter },
    select: { id: true, createdAt: true, channel: true, nationality: true },
  })

  const searchesTotal = sessions.length

  // Channel breakdown with conversion
  const channelMap: Record<string, { searches: number; bookings: number }> = {}
  for (const s of sessions) {
    const ch = s.channel ?? 'direct'
    if (!channelMap[ch]) channelMap[ch] = { searches: 0, bookings: 0 }
    channelMap[ch].searches++
    if (convertedSearchIds.has(s.id)) channelMap[ch].bookings++
  }
  const searchesByChannel: DashboardChannelStat[] = Object.entries(channelMap).map(([channel, d]) => ({
    channel,
    searches: d.searches,
    bookings: d.bookings,
    conversionRate: d.searches > 0 ? Math.round((d.bookings / d.searches) * 1000) / 10 : 0,
  })).sort((a, b) => b.searches - a.searches)

  // Top nationalities from search sessions
  const natCount: Record<string, number> = {}
  for (const s of sessions) {
    if (s.nationality) natCount[s.nationality] = (natCount[s.nationality] ?? 0) + 1
  }
  const topNationalities = Object.entries(natCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([nationality, count]) => ({ nationality, count }))

  // ── Marketing ─────────────────────────────────────────────────────────────

  const bookingIdFilter = scopedPropertyIds !== null
    ? { booking: { propertyId: { in: scopedPropertyIds } } }
    : {}

  const [affiliateRows, campaignRows, promoRows] = await Promise.all([
    prisma.affiliateBooking.findMany({
      where: { createdAt: { gte: from, lte: to }, ...bookingIdFilter },
      include: {
        affiliate: { select: { name: true } },
        booking: { select: { totalAmount: true } },
      },
    }),
    prisma.campaignBooking.findMany({
      where: { createdAt: { gte: from, lte: to }, ...bookingIdFilter },
      include: {
        campaign: { select: { code: true } },
        booking: { select: { totalAmount: true } },
      },
    }),
    prisma.booking.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        promoCode: { not: null },
        ...propertyIdFilter,
      },
      select: { promoCode: true, totalAmount: true, originalPrice: true },
    }),
  ])

  // Affiliates
  const affiliateMap: Record<string, { bookings: number; revenue: number; commission: number }> = {}
  for (const r of affiliateRows) {
    const name = r.affiliate.name
    const a = affiliateMap[name] ?? (affiliateMap[name] = { bookings: 0, revenue: 0, commission: 0 })
    a.bookings++
    a.revenue += Number(r.booking.totalAmount)
    a.commission += Number(r.commissionAmount)
  }
  const topAffiliates = Object.entries(affiliateMap)
    .map(([name, d]) => ({ name, ...d, revenue: Math.round(d.revenue * 100) / 100, commission: Math.round(d.commission * 100) / 100 }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 8)
  const affiliateBookings = affiliateRows.length
  const affiliateRevenue = Math.round(affiliateRows.reduce((s, r) => s + Number(r.booking.totalAmount), 0) * 100) / 100
  const affiliateCommission = Math.round(affiliateRows.reduce((s, r) => s + Number(r.commissionAmount), 0) * 100) / 100

  // Campaigns
  const campaignMap: Record<string, { bookings: number; revenue: number; commission: number }> = {}
  for (const r of campaignRows) {
    const code = r.campaign.code
    const c = campaignMap[code] ?? (campaignMap[code] = { bookings: 0, revenue: 0, commission: 0 })
    c.bookings++
    c.revenue += Number(r.booking.totalAmount)
    c.commission += Number(r.commissionAmount)
  }
  const topCampaigns = Object.entries(campaignMap)
    .map(([code, d]) => ({ code, ...d, revenue: Math.round(d.revenue * 100) / 100, commission: Math.round(d.commission * 100) / 100 }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 8)
  const campaignBookings = campaignRows.length
  const campaignRevenue = Math.round(campaignRows.reduce((s, r) => s + Number(r.booking.totalAmount), 0) * 100) / 100
  const campaignCommission = Math.round(campaignRows.reduce((s, r) => s + Number(r.commissionAmount), 0) * 100) / 100

  // Promo codes
  const promoMap: Record<string, { uses: number; discountTotal: number }> = {}
  for (const b of promoRows) {
    if (!b.promoCode) continue
    const p = promoMap[b.promoCode] ?? (promoMap[b.promoCode] = { uses: 0, discountTotal: 0 })
    p.uses++
    const discount = b.originalPrice ? Number(b.originalPrice) - Number(b.totalAmount) : 0
    p.discountTotal += Math.max(0, discount)
  }
  const topPromoCodes = Object.entries(promoMap)
    .map(([code, d]) => ({ code, uses: d.uses, discountTotal: Math.round(d.discountTotal * 100) / 100 }))
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 8)
  const promoBookings = promoRows.length
  const promoDiscountTotal = Math.round(Object.values(promoMap).reduce((s, p) => s + p.discountTotal, 0) * 100) / 100

  // ── Daily time series ─────────────────────────────────────────────────────

  const bookingsByDate: Record<string, { count: number; revenue: number }> = {}
  const searchesByDate: Record<string, number> = {}
  for (const d of dates) {
    bookingsByDate[d] = { count: 0, revenue: 0 }
    searchesByDate[d] = 0
  }

  for (const b of bookings) {
    const d = b.createdAt.toISOString().slice(0, 10)
    if (bookingsByDate[d]) {
      bookingsByDate[d].count++
      bookingsByDate[d].revenue += Number(b.totalAmount)
    }
  }
  for (const s of sessions) {
    const d = s.createdAt.toISOString().slice(0, 10)
    if (searchesByDate[d] !== undefined) searchesByDate[d]++
  }

  const byDay: DashboardDayStat[] = dates.map(date => ({
    date,
    bookings: bookingsByDate[date]?.count ?? 0,
    revenue: Math.round((bookingsByDate[date]?.revenue ?? 0) * 100) / 100,
    searches: searchesByDate[date] ?? 0,
  }))

  return {
    currency,
    periodDays: days,
    bookingsTotal: bookings.length,
    bookingsToday,
    revenueTotal: Math.round(revenueTotal * 100) / 100,
    revenueToday: Math.round(revenueToday * 100) / 100,
    adr,
    visitorsTotal,
    visitorsByPage,
    visitorsByDevice,
    bookingsByStatus,
    byDay,
    searchesTotal,
    searchesByChannel,
    topNationalities,
    affiliateBookings,
    affiliateRevenue,
    affiliateCommission,
    topAffiliates,
    campaignBookings,
    campaignRevenue,
    campaignCommission,
    topCampaigns,
    promoBookings,
    promoDiscountTotal,
    topPromoCodes,
  }
}
