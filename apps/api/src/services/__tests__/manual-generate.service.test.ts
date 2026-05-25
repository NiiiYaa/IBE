import { describe, it, expect, vi } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: { systemAIConfig: { findFirst: vi.fn() } },
}))

vi.mock('./ai-config.service.js', () => ({
  decryptApiKey: vi.fn((k: string) => k),
}))

import { MANUAL_SECTIONS, readSectionFiles, filterSectionsByRole } from '../manual-generate.service.js'

describe('MANUAL_SECTIONS', () => {
  it('has no duplicate ids', () => {
    const ids = MANUAL_SECTIONS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all audiences are valid', () => {
    for (const s of MANUAL_SECTIONS) {
      expect(['hotel', 'super', 'both']).toContain(s.audience)
    }
  })
})

describe('filterSectionsByRole', () => {
  const sections = [
    { id: 'a', title: 'A', audience: 'hotel' as const, markdown: '' },
    { id: 'b', title: 'B', audience: 'super' as const, markdown: '' },
    { id: 'c', title: 'C', audience: 'both' as const, markdown: '' },
  ]

  it('hotel role sees hotel + both', () => {
    const result = filterSectionsByRole(sections, 'hotel')
    expect(result.map(s => s.id)).toEqual(['a', 'c'])
  })

  it('super role sees all', () => {
    const result = filterSectionsByRole(sections, 'super')
    expect(result.map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('admin role sees hotel + both', () => {
    const result = filterSectionsByRole(sections, 'admin')
    expect(result.map(s => s.id)).toEqual(['a', 'c'])
  })
})

describe('readSectionFiles', () => {
  it('returns empty string for non-existent file without throwing', async () => {
    const result = await readSectionFiles(['/nonexistent/file.tsx'])
    expect(result).toBe('')
  })
})
