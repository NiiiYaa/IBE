import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionExpiredBanner } from '../SessionExpiredBanner'

describe('SessionExpiredBanner', () => {
  it('renders both action buttons', () => {
    render(<SessionExpiredBanner onRefresh={vi.fn()} onBack={vi.fn()} />)
    const refreshBtn = screen.getByRole('button', { name: /check prices again/i })
    const backBtn = screen.getByRole('button', { name: /back to search/i })
    expect(refreshBtn).toBeTruthy()
    expect(backBtn).toBeTruthy()
  })

  it('calls onRefresh when "Check prices again" is clicked', async () => {
    const onRefresh = vi.fn()
    render(<SessionExpiredBanner onRefresh={onRefresh} onBack={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /check prices again/i }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('calls onBack when "Back to search" is clicked', async () => {
    const onBack = vi.fn()
    render(<SessionExpiredBanner onRefresh={vi.fn()} onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: /back to search/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
