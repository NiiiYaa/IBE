import { describe, it, expect, vi } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: { systemAIConfig: { findFirst: vi.fn() } },
}))

vi.mock('./ai-config.service.js', () => ({
  decryptApiKey: vi.fn((k: string) => k),
}))

import { MANUAL_SECTIONS, readSectionFiles, filterSectionsByRole, extractUiContent } from '../manual-generate.service.js'

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

describe('extractUiContent', () => {
  it('strips imports and keeps return block for tsx files', () => {
    const source = `
'use client'
import { useState } from 'react'
import { apiClient } from '@/lib/api-client'

export default function MyPage() {
  const [x, setX] = useState(false)
  async function save() { await apiClient.doSomething() }
  return (
    <div>
      <label>My Field</label>
      <p>Description text</p>
    </div>
  )
}
`.trim()

    const result = extractUiContent(source, 'apps/web/src/app/admin/page.tsx')
    expect(result).toContain('My Field')
    expect(result).toContain('Description text')
    expect(result).not.toContain("import { useState }")
    expect(result).not.toContain("async function save")
  })

  it('extracts multiple return blocks from one file', () => {
    const source = `
import { x } from 'y'
function A() {
  return (<span>Label A</span>)
}
function B() {
  return (<span>Label B</span>)
}
`.trim()

    const result = extractUiContent(source, 'page.tsx')
    expect(result).toContain('Label A')
    expect(result).toContain('Label B')
  })

  it('returns truncated raw source for non-tsx files', () => {
    const source = 'const x = 1\n'.repeat(400)
    const result = extractUiContent(source, 'route.ts')
    expect(result.length).toBeLessThanOrEqual(3100)
  })

  it('samples beginning and end for large tsx files', () => {
    // Build a file with large return blocks so extracted JSX exceeds MAX
    const makeComp = (label: string) =>
      `function Comp${label}() {\n  return (\n    <div>\n      <label>Field ${label}</label>\n      <p>${'x'.repeat(60)} description ${label}</p>\n    </div>\n  )\n}\n`
    const source = Array.from({ length: 60 }, (_, i) => makeComp(String(i))).join('\n')
    const result = extractUiContent(source, 'big-page.tsx')
    expect(result.length).toBeLessThanOrEqual(3100)
    // Should contain content from the beginning AND the end
    expect(result).toContain('Field 0')
    expect(result).toContain('Field 59')
    expect(result).toContain('[...]')
  })
})
