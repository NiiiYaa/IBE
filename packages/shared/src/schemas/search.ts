import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format')
const iso2Country = z.string().regex(/^[A-Z]{2}$/, 'Expected ISO 3166-1 alpha-2 country code')
const iso4217Currency = z.string().regex(/^[A-Z]{3}$/, 'Expected ISO 4217 currency code')

export const RoomOccupancySchema = z.object({
  adults: z.number().int().min(1).max(9),
  childAges: z.array(z.number().int().min(0).max(17)).optional(),
})

export const SearchParamsSchema = z.object({
  hotelId: z.number().int().positive(),
  checkIn: isoDate,
  checkOut: isoDate,
  rooms: z.array(RoomOccupancySchema).min(1).max(9),
  nationality: iso2Country.optional(),
  currency: iso4217Currency.optional(),
  promoCode: z.string().max(50).optional(),
  affiliateCode: z.string().max(100).optional(),
}).refine(
  (data) => data.checkOut > data.checkIn,
  { message: 'checkOut must be after checkIn', path: ['checkOut'] },
)

export type SearchParamsInput = z.infer<typeof SearchParamsSchema>
