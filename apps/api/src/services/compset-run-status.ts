export interface CompSetRunStatus {
  status: 'idle' | 'running' | 'done'
  startedAt?: string // ISO
  totalParams: number
  doneParams: number
  durationSec?: number
  found: number
  notFound: number
  errors: number
  runLabel?: string // 'all' for Run All, competitor name for single run
}

const runMap = new Map<number, CompSetRunStatus>()
const competitorRunMap = new Map<number, CompSetRunStatus>()

export function getRunStatus(propertyId: number): CompSetRunStatus {
  return runMap.get(propertyId) ?? { status: 'idle', totalParams: 0, doneParams: 0, found: 0, notFound: 0, errors: 0 }
}

export function setRunStatus(propertyId: number, status: CompSetRunStatus): void {
  runMap.set(propertyId, status)
}

export function getCompetitorRunStatus(competitorId: number): CompSetRunStatus {
  return competitorRunMap.get(competitorId) ?? { status: 'idle', totalParams: 0, doneParams: 0, found: 0, notFound: 0, errors: 0 }
}

export function setCompetitorRunStatus(competitorId: number, status: CompSetRunStatus): void {
  competitorRunMap.set(competitorId, status)
}
