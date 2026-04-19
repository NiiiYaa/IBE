import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PaymentFlow, StripeIntentType } from '@ibe/shared'

const mockPaymentIntentsCreate = vi.fn()
const mockPaymentIntentsCapture = vi.fn()
const mockPaymentIntentsCancel = vi.fn()
const mockSetupIntentsCreate = vi.fn()

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
      capture: mockPaymentIntentsCapture,
      cancel: mockPaymentIntentsCancel,
    },
    setupIntents: {
      create: mockSetupIntentsCreate,
    },
  })),
}))

vi.mock('../../../db/client.js', () => ({
  prisma: {
    stripePaymentRecord: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

describe('StripeGateway', () => {
  let gateway: import('../stripe.gateway.js').StripeGateway

  beforeEach(async () => {
    vi.clearAllMocks()
    const { StripeGateway } = await import('../stripe.gateway.js')
    gateway = new StripeGateway()
  })

  it('has name "stripe"', () => {
    expect(gateway.name).toBe('stripe')
  })

  describe('createIntent — OnlineCharge', () => {
    it('creates a PaymentIntent with manual capture', async () => {
      mockPaymentIntentsCreate.mockResolvedValueOnce({
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
        status: 'requires_payment_method',
      })

      const result = await gateway.createIntent(PaymentFlow.OnlineCharge, {
        amount: 25000,
        currency: 'EUR',
        propertyId: 19912,
      })

      expect(result.intentType).toBe(StripeIntentType.Payment)
      expect(result.paymentFlow).toBe(PaymentFlow.OnlineCharge)
      expect(result.gatewayName).toBe('stripe')
      expect(result.clientSecret).toBe('pi_test_123_secret')
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 25000, currency: 'eur', capture_method: 'manual' }),
      )
    })

    it('throws when amount is missing', async () => {
      await expect(
        gateway.createIntent(PaymentFlow.OnlineCharge, { propertyId: 1 }),
      ).rejects.toThrow('amount and currency are required')
    })

    it('throws when currency is missing', async () => {
      await expect(
        gateway.createIntent(PaymentFlow.OnlineCharge, { amount: 1000, propertyId: 1 }),
      ).rejects.toThrow('amount and currency are required')
    })
  })

  describe('createIntent — PayAtHotelGuarantee', () => {
    it('creates a SetupIntent with off_session usage', async () => {
      mockSetupIntentsCreate.mockResolvedValueOnce({
        id: 'seti_test_456',
        client_secret: 'seti_test_456_secret',
        status: 'requires_payment_method',
      })

      const result = await gateway.createIntent(PaymentFlow.PayAtHotelGuarantee, { propertyId: 1 })

      expect(result.intentType).toBe(StripeIntentType.Setup)
      expect(result.gatewayName).toBe('stripe')
      expect(mockSetupIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ usage: 'off_session' }),
      )
    })
  })

  describe('createIntent — PayAtHotelNoCard', () => {
    it('throws — must not be called for no-card flow', async () => {
      await expect(
        gateway.createIntent(PaymentFlow.PayAtHotelNoCard, { propertyId: 1 }),
      ).rejects.toThrow('requires no intent')
    })
  })

  describe('capture', () => {
    it('calls paymentIntents.capture', async () => {
      mockPaymentIntentsCapture.mockResolvedValueOnce({ id: 'pi_test_123', status: 'succeeded' })
      await gateway.capture('pi_test_123')
      expect(mockPaymentIntentsCapture).toHaveBeenCalledWith('pi_test_123')
    })
  })

  describe('cancel', () => {
    it('calls paymentIntents.cancel', async () => {
      mockPaymentIntentsCancel.mockResolvedValueOnce({ id: 'pi_test_123', status: 'canceled' })
      await gateway.cancel('pi_test_123')
      expect(mockPaymentIntentsCancel).toHaveBeenCalledWith('pi_test_123')
    })

    it('does not throw if cancel fails', async () => {
      mockPaymentIntentsCancel.mockRejectedValueOnce(new Error('Already captured'))
      await expect(gateway.cancel('pi_test_123')).resolves.toBeUndefined()
    })
  })
})
