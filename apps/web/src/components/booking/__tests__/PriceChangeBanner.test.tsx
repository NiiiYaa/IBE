import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriceChangeBanner } from '../PriceChangeBanner'

const changes = [
  { roomName: 'Deluxe Room', oldAmount: 200, newAmount: 220, currency: 'USD' },
]

describe('PriceChangeBanner', () => {
  it('renders old and new prices', () => {
    render(<PriceChangeBanner changes={changes} locale="en-US" onAccept={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText(/200/)).toBeTruthy()
    expect(screen.getByText(/220/)).toBeTruthy()
  })

  it('renders the room name', () => {
    render(<PriceChangeBanner changes={changes} locale="en-US" onAccept={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText(/Deluxe Room/i)).toBeTruthy()
  })

  it('calls onAccept when "Accept new price" is clicked', async () => {
    const onAccept = vi.fn()
    render(<PriceChangeBanner changes={changes} locale="en-US" onAccept={onAccept} onBack={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /accept new price/i }))
    expect(onAccept).toHaveBeenCalledOnce()
  })

  it('calls onBack when "Back to search" is clicked', async () => {
    const onBack = vi.fn()
    render(<PriceChangeBanner changes={changes} locale="en-US" onAccept={vi.fn()} onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: /back to search/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('renders multiple changed rooms', () => {
    const multi = [
      { roomName: 'Room A', oldAmount: 100, newAmount: 110, currency: 'USD' },
      { roomName: 'Room B', oldAmount: 150, newAmount: 140, currency: 'USD' },
    ]
    render(<PriceChangeBanner changes={multi} locale="en-US" onAccept={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText(/Room A/i)).toBeTruthy()
    expect(screen.getByText(/Room B/i)).toBeTruthy()
  })
})
