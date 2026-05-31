import { PrismaClient } from '@prisma/client'
import { detectCountryFromDomain, isRedundantEntry, type BlockedEntryMinimal } from '@ibe/shared'

const prisma = new PrismaClient()

async function backfill() {
  const all = await prisma.onboardingBlockedDomain.findMany({
    select: { id: true, domain: true, matchType: true, country: true, redundant: true },
  })

  // Global non-redundant entries are the baseline for redundancy checks
  const globalEntries: BlockedEntryMinimal[] = all.filter(e => !e.country && !e.redundant)

  let countryTagged = 0
  let markedRedundant = 0
  let skipped = 0

  for (const entry of all) {
    const updates: { country?: string; redundant?: boolean } = {}

    // 1. Auto-detect country if not already set
    if (!entry.country) {
      const detected = detectCountryFromDomain(entry.domain)
      if (detected) {
        updates.country = detected
        countryTagged++
      }
    }

    // 2. Redundancy check — exclude self to avoid self-match
    if (!entry.redundant) {
      const othersGlobal = globalEntries.filter(e => e.domain !== entry.domain)
      if (isRedundantEntry(entry.domain, othersGlobal)) {
        updates.redundant = true
        markedRedundant++
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.onboardingBlockedDomain.update({ where: { id: entry.id }, data: updates })
      console.log(`  updated ${entry.domain}: ${JSON.stringify(updates)}`)
    } else {
      skipped++
    }
  }

  console.log(`\nBackfill complete:`)
  console.log(`  country-tagged:   ${countryTagged}`)
  console.log(`  marked redundant: ${markedRedundant}`)
  console.log(`  unchanged:        ${skipped}`)
}

backfill()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
