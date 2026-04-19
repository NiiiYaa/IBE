import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PaymentFlow, PaymentMethodType, BookingStatus, GuestTitle } from '@ibe/shared'
import type { CreateBookingRequest } from '@ibe/shared'

vi.mock('../../adapters/hyperguest/booking.js', () => ({
  createBooking: vi.fn(),
}))

vi.mock('../../db/client.js', () => ({
  prisma: {
    booking: {
      create: vi.fn().mockResolvedValue({ id: 42, rooms: [] }),
    },
    stripePaymentRecord: {
      updateMany: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock('../payment/payment.service.js', () => ({
  capturePayment: vi.fn().mockResolvedValue(undefined),
  cancelPayment: vi.fn().mockResolvedValue(undefined),
  linkPaymentToBooking: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

const baseRequest: CreateBookingRequest = {
  propertyId: 19912,
  checkIn: '2024-06-01',
  checkOut: '2024-06-02',
  leadGuest: {
    title: GuestTitle.Mr,
    firstName: 'Test',
    lastName: 'User',
    birthDate: '1990-01-01',
    email: 'test@example.com',
    phone: '+1234567890',
    country: 'DE',
  },
  rooms: [
    {
      roomId: 1234,
      ratePlanId: 19080,
      roomCode: 'SGL',
      rateCode: 'BAR',
      expectedAmount: 250,
      expectedCurrency: 'EUR',
      guests: [{ title: GuestTitle.Mr, firstName: 'Test', lastName: 'User', birthDate: '1990-01-01' }],
    },
  ],
  paymentMethod: PaymentMethodType.CreditCard,
  paymentFlow: PaymentFlow.OnlineCharge,
}

const confirmedHGResponse = {
  content: {
    bookingId: 113421,
    status: BookingStatus.Confirmed,
    dates: { from: '2024-06-01', to: '2024-06-02' },
    meta: [],
    payment: { type: 'credit_card', chargeAmount: { price: 250, currency: 'EUR' } },
    prices: { net: { price: 200, currency: 'EUR', taxes: [] }, sell: { price: 250, currency: 'EUR', taxes: [] }, commission: { price: 25, currency: 'EUR' }, bar: { price: 250, currency: 'EUR' }, fees: [] },
    nightlyBreakdown: [],
    rooms: [],
    reference: { agency: '' },
    leadGuest: { guestId: 1, name: { first: 'Test', last: 'User' }, birthDate: '1990-01-01', contact: { email: 'test@example.com', phone: '', address: '', city: '', country: 'DE', state: '', zip: '' }, title: GuestTitle.Mr, age: 34 },
    transactions: [],
    propertyId: 19912,
  },
  financialModel: { keys: [], type: 'default' },
  timestamp: '2024-06-01T00:00:00.000Z',
}

describe('booking service — payment flows', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('OnlineCharge flow', () => {
    it('captures Stripe payment after confirmed booking', async () => {
      const { createBooking } = await import('../../adapters/hyperguest/booking.js')
      vi.mocked(createBooking).mockResolvedValueOnce(confirmedHGResponse as never)

      const { capturePayment, linkPaymentToBooking } = await import('../payment/payment.service.js')
      const { book } = await import('../booking.service.js')

      await book({
        ...baseRequest,
        paymentFlow: PaymentFlow.OnlineCharge,
        stripePaymentIntentId: 'pi_test_123',
      })

      expect(capturePayment).toHaveBeenCalledWith('pi_test_123')
      expect(linkPaymentToBooking).toHaveBeenCalledWith('pi_test_123', 42)
    })

    it('cancels Stripe payment when HyperGuest booking fails', async () => {
      const { createBooking } = await import('../../adapters/hyperguest/booking.js')
      const { HyperGuestApiError } = await import('../../adapters/hyperguest/client.js')
      vi.mocked(createBooking).mockRejectedValueOnce(
        new HyperGuestApiError('BN.500', 'Internal error'),
      )

      const { cancelPayment } = await import('../payment/payment.service.js')
      const { book, BookingError } = await import('../booking.service.js')

      await expect(
        book({ ...baseRequest, paymentFlow: PaymentFlow.OnlineCharge, stripePaymentIntentId: 'pi_test_123' }),
      ).rejects.toThrow(BookingError)

      expect(cancelPayment).toHaveBeenCalledWith('pi_test_123')
    })
  })

  describe('PayAtHotelGuarantee flow', () => {
    it('does not call capturePayment', async () => {
      const { createBooking } = await import('../../adapters/hyperguest/booking.js')
      vi.mocked(createBooking).mockResolvedValueOnce(confirmedHGResponse as never)

      const { capturePayment, linkPaymentToBooking } = await import('../payment/payment.service.js')
      const { book } = await import('../booking.service.js')

      await book({
        ...baseRequest,
        paymentFlow: PaymentFlow.PayAtHotelGuarantee,
        stripeSetupIntentId: 'seti_test_456',
      })

      expect(capturePayment).not.toHaveBeenCalled()
      expect(linkPaymentToBooking).toHaveBeenCalledWith('seti_test_456', 42)
    })
  })

  describe('PayAtHotelNoCard flow', () => {
    it('does not call any payment method', async () => {
      const { createBooking } = await import('../../adapters/hyperguest/booking.js')
      vi.mocked(createBooking).mockResolvedValueOnce(confirmedHGResponse as never)

      const { capturePayment, cancelPayment, linkPaymentToBooking } =
        await import('../payment/payment.service.js')
      const { book } = await import('../booking.service.js')

      await book({ ...baseRequest, paymentFlow: PaymentFlow.PayAtHotelNoCard })

      expect(capturePayment).not.toHaveBeenCalled()
      expect(cancelPayment).not.toHaveBeenCalled()
      expect(linkPaymentToBooking).not.toHaveBeenCalled()
    })
  })
})
