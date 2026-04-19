'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { addDays, todayIso } from '@ibe/shared'
import { Button } from '@/components/ui/button'
import { encodeSearchParams } from '@/lib/search-params'

const schema = z
  .object({
    hotelId: z.coerce.number().int().positive(),
    checkIn: z.string().min(1, 'Check-in date required'),
    checkOut: z.string().min(1, 'Check-out date required'),
    rooms: z
      .array(
        z.object({
          adults: z.coerce.number().int().min(1).max(9),
          children: z.coerce.number().int().min(0).max(6),
        }),
      )
      .min(1),
    nationality: z.string().length(2).optional().or(z.literal('')),
    currency: z.string().length(3).optional().or(z.literal('')),
  })
  .refine((d) => d.checkOut > d.checkIn, {
    message: 'Check-out must be after check-in',
    path: ['checkOut'],
  })

type FormValues = z.infer<typeof schema>

interface SearchFormProps {
  hotelId: number
  defaultCurrency?: string
  defaultNationality?: string
}

export function SearchForm({ hotelId, defaultCurrency = 'EUR', defaultNationality }: SearchFormProps) {
  const router = useRouter()
  const today = todayIso()
  const tomorrow = addDays(today, 1)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      hotelId,
      checkIn: today,
      checkOut: addDays(today, 2),
      rooms: [{ adults: 2, children: 0 }],
      nationality: defaultNationality ?? '',
      currency: defaultCurrency,
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'rooms' })

  function onSubmit(values: FormValues) {
    const qs = encodeSearchParams({
      hotelId: values.hotelId,
      checkIn: values.checkIn,
      checkOut: values.checkOut,
      rooms: values.rooms.map((r) => ({ adults: r.adults })), // child ages simplified for now
      nationality: values.nationality || undefined,
      currency: values.currency || undefined,
    })
    router.push(`/search?${qs.toString()}`)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
      <input type="hidden" {...register('hotelId')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Check-in */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Check-in</label>
          <input
            type="date"
            min={today}
            {...register('checkIn')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {errors.checkIn && (
            <p className="mt-1 text-xs text-red-600">{errors.checkIn.message}</p>
          )}
        </div>

        {/* Check-out */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Check-out</label>
          <input
            type="date"
            min={tomorrow}
            {...register('checkOut')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {errors.checkOut && (
            <p className="mt-1 text-xs text-red-600">{errors.checkOut.message}</p>
          )}
        </div>
      </div>

      {/* Rooms */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Rooms & Guests</label>
        {fields.map((field, i) => (
          <div key={field.id} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-sm text-gray-500">Room {i + 1}</span>
            <div className="flex items-center gap-1">
              <label className="text-sm text-gray-600">Adults</label>
              <input
                type="number"
                min={1}
                max={9}
                {...register(`rooms.${i}.adults`)}
                className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-sm text-gray-600">Children</label>
              <input
                type="number"
                min={0}
                max={6}
                {...register(`rooms.${i}.children`)}
                className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            {fields.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-sm text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {fields.length < 9 && (
          <button
            type="button"
            onClick={() => append({ adults: 2, children: 0 })}
            className="text-sm text-brand-600 hover:underline"
          >
            + Add room
          </button>
        )}
      </div>

      {/* Currency */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
          <input
            type="text"
            placeholder="EUR"
            maxLength={3}
            {...register('currency')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nationality</label>
          <input
            type="text"
            placeholder="DE"
            maxLength={2}
            {...register('nationality')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase"
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full">
        Check Availability
      </Button>
    </form>
  )
}
