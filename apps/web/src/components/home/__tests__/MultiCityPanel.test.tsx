import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { MultiCityPanel } from '../MultiCityPanel'
import type { PropertyOption } from '@/components/search/SearchBar'

vi.mock('@/context/translations', () => ({
  useT: () => (key: string) => key,
  useLocale: () => 'en',
}))
vi.mock('@/lib/api-client', () => ({
  apiClient: { search: vi.fn().mockResolvedValue({ results: [], currency: 'USD', searchId: '', checkIn: '', checkOut: '' }) },
}))
vi.mock('@/hooks/use-country-detect', () => ({ useCountryDetect: () => null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const properties: PropertyOption[] = [
  { id: 1, name: 'Hotel A', city: 'Paris', isDefault: true },
  { id: 2, name: 'Hotel B', city: 'Lyon' },
]

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('MultiCityPanel', () => {
  it('renders SharedBar, one LegBar, and a disabled Check Availability button', () => {
    render(createElement(MultiCityPanel, { properties, maxLegs: 3, infantMaxAge: 2, childMaxAge: 16 }), { wrapper })
    // shared bar segments
    expect(screen.getAllByText('guests').length).toBeGreaterThan(0)
    // CTA always visible but disabled until all legs have city
    const cta = screen.getByText('checkAvailability')
    expect((cta as HTMLButtonElement).disabled).toBe(true)
  })

  it('Add city button is in DOM but invisible (no city selected)', () => {
    render(createElement(MultiCityPanel, { properties, maxLegs: 3, infantMaxAge: 2, childMaxAge: 16 }), { wrapper })
    // Button is rendered (in DOM for fixed-width layout) but inactive
    expect(screen.getAllByText(/multiCityAddCity/).length).toBe(1)
  })

  it('does not add a second leg when clicking Add with no city selected', () => {
    render(createElement(MultiCityPanel, { properties, maxLegs: 3, infantMaxAge: 2, childMaxAge: 16 }), { wrapper })
    fireEvent.click(screen.getByText(/multiCityAddCity/))
    // Still only 1 Add button (no new leg)
    expect(screen.getAllByText(/multiCityAddCity/).length).toBe(1)
    expect(screen.queryAllByText(/multiCityRemove/).length).toBe(1)
  })
})
