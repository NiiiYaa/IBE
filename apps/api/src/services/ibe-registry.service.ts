import { prisma } from '../db/client.js'
import type { IBERegistryEntry } from '@ibe/shared'

export async function lookupIBERegistry(hostname: string): Promise<IBERegistryEntry | null> {
  const row = await prisma.iBERegistry.findUnique({ where: { hostname } })
  if (!row) return null
  return { hostname: row.hostname, name: row.name, searchTemplate: row.searchTemplate }
}

export async function upsertIBERegistry(entry: IBERegistryEntry): Promise<IBERegistryEntry> {
  const row = await prisma.iBERegistry.upsert({
    where: { hostname: entry.hostname },
    create: { hostname: entry.hostname, name: entry.name, searchTemplate: entry.searchTemplate },
    update: { name: entry.name, searchTemplate: entry.searchTemplate },
  })
  return { hostname: row.hostname, name: row.name, searchTemplate: row.searchTemplate }
}
