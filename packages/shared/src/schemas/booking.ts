import { z } from 'zod'
import { GuestTitle, PaymentFlow, PaymentMethodType } from '../enums.js'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format')
const iso2Country = z.string().regex(/^[A-Z]{2}$/, 'Expected ISO 3166-1 alpha-2 country code')

export const GuestInfoSchema = z.object({
  title: z.nativeEnum(GuestTitle),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  birthDate: isoDate,
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  country: iso2Country.optional(),
  state: z.string().max(100).optional(),
  zip: z.string().max(20).optional(),
})

export const BookingRoomRequestSchema = z.object({
  roomId: z.number().int().positive(),
  ratePlanId: z.number().int().positive(),
  roomCode: z.string().min(1),
  rateCode: z.string().min(1),
  expectedAmount: z.number().positive(),
  expectedCurrency: z.string().length(3),
  guests: z.array(GuestInfoSchema).min(1).max(10),
  specialRequests: z.array(z.string().max(500)).optional(),
})

export const CreateBookingRequestSchema = z.object({
  propertyId: z.number().int().positive(),
  checkIn: isoDate,
  checkOut: isoDate,
  leadGuest: GuestInfoSchema.extend({
    email: z.string().email(),
    phone: z.string().min(5).max(30),
    country: iso2Country,
  }),
  rooms: z.array(BookingRoomRequestSchema).min(1).max(9),
  paymentMethod: z.nativeEnum(PaymentMethodType),
  paymentFlow: z.nativeEnum(PaymentFlow),
  stripePaymentIntentId: z.string().optional(),
  stripeSetupIntentId: z.string().optional(),
  agencyReference: z.string().max(100).optional(),
  affiliateId: z.string().max(100).optional(),
  searchId: z.string().optional(),
  isTest: z.boolean().optional(),
  sourceOrgSlug: z.string().max(100).optional(),
})
  .refine(
    (data) => data.checkOut > data.checkIn,
    { message: 'checkOut must be after checkIn', path: ['checkOut'] },
  )
  .refine(
    (data) =>
      data.paymentFlow !== PaymentFlow.OnlineCharge || !!data.stripePaymentIntentId,
    { message: 'stripePaymentIntentId is required for online_charge flow', path: ['stripePaymentIntentId'] },
  )
  .refine(
    (data) =>
      data.paymentFlow !== PaymentFlow.PayAtHotelGuarantee || !!data.stripeSetupIntentId,
    { message: 'stripeSetupIntentId is required for pay_at_hotel_guarantee flow', path: ['stripeSetupIntentId'] },
  )

export type CreateBookingRequestInput = z.infer<typeof CreateBookingRequestSchema>
export type GuestInfoInput = z.infer<typeof GuestInfoSchema>
