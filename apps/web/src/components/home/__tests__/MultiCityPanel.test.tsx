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
  it('renders shared Guests/Nationality bar and one leg bar with Add city', () => {
    render(createElement(MultiCityPanel, { properties, maxLegs: 3, infantMaxAge: 2, childMaxAge: 16 }), { wrapper })
    expect(screen.getAllByText('guests').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/multiCityAddCity/).length).toBe(1)
  })

  it('shows Add city button when below maxLegs', () => {
    render(createElement(MultiCityPanel, { properties, maxLegs: 3, infantMaxAge: 2, childMaxAge: 16 }), { wrapper })
    expect(screen.getByText(/multiCityAddCity/)).toBeDefined()
  })

  it('adds a second leg when Add city is clicked', () => {
    render(createElement(MultiCityPanel, { properties, maxLegs: 3, infantMaxAge: 2, childMaxAge: 16 }), { wrapper })
    fireEvent.click(screen.getByText(/multiCityAddCity/))
    // Both legs render the Add button; leg 1's is invisible (keeps layout width)
    expect(screen.getAllByText(/multiCityAddCity/).length).toBe(2)
    // Both legs now have canRemove=true → both Remove buttons visible
    expect(screen.getAllByText(/multiCityRemove/).length).toBe(2)
  })
})
