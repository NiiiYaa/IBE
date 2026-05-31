import { describe, it, expect } from 'vitest'
import { getAriSourceList, ARI_SYSTEMS } from '../types/ari-source.js'

const mockFlows = [
  { pmsId: 12, pmsName: 'SiteMinder' },
  { pmsId: 4,  pmsName: 'Mews' },
]

describe('getAriSourceList', () => {
  it('returns hg_has items first, to_be_added items second', () => {
    const list = getAriSourceList(mockFlows)
    const firstKind = list[0]?.kind
    const lastKind = list[list.length - 1]?.kind
    expect(firstKind).toBe('hg_has')
    expect(lastKind).toBe('to_be_added')
  })

  it('hg_has items are sorted alphabetically', () => {
    const list = getAriSourceList(mockFlows)
    const hg = list.filter(o => o.kind === 'hg_has')
    expect(hg[0]?.name).toBe('Mews')
    expect(hg[1]?.name).toBe('SiteMinder')
  })

  it('returns one hg_has entry per vendor flow', () => {
    const list = getAriSourceList(mockFlows)
    const hg = list.filter(o => o.kind === 'hg_has')
    expect(hg).toHaveLength(mockFlows.length)
  })

  it('returns all ARI_SYSTEMS as to_be_added', () => {
    const list = getAriSourceList(mockFlows)
    const toAdd = list.filter(o => o.kind === 'to_be_added')
    expect(toAdd).toHaveLength(ARI_SYSTEMS.length)
  })

  it('empty vendor flows returns only to_be_added items', () => {
    const list = getAriSourceList([])
    expect(list.every(o => o.kind === 'to_be_added')).toBe(true)
  })

  it('hg_has items carry the pmsId', () => {
    const list = getAriSourceList(mockFlows)
    const mews = list.find(o => o.kind === 'hg_has' && o.name === 'Mews')
    expect(mews).toBeDefined()
    if (mews?.kind === 'hg_has') expect(mews.pmsId).toBe(4)
  })
})
