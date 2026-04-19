import { z } from 'zod'
import { PaymentFlow } from '../enums.js'

export const CreatePaymentIntentRequestSchema = z
  .object({
    paymentFlow: z.nativeEnum(PaymentFlow),
    amount: z.number().int().positive().optional(),
    currency: z.string().length(3).optional(),
    propertyId: z.number().int().positive(),
  })
  .refine(
    (d) =>
      d.paymentFlow !== PaymentFlow.OnlineCharge ||
      (d.amount !== undefined && d.currency !== undefined),
    {
      message: 'amount and currency are required for online_charge flow',
      path: ['amount'],
    },
  )

export type CreatePaymentIntentRequestInput = z.infer<typeof CreatePaymentIntentRequestSchema>
