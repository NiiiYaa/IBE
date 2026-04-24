import { prisma } from './client.js'
import bcrypt from 'bcryptjs'

async function seed() {
  // ── Default organization ───────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: 'hyperguest' },
    create: { name: 'HyperGuest', slug: 'hyperguest', hyperGuestOrgId: '1' },
    update: { hyperGuestOrgId: '1' },
  })
  console.log(`✓ Organization: ${org.name} (id=${org.id})`)

  // ── Superadmin ────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('niribe', 10)
  const admin = await prisma.adminUser.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'nir@hyperguest.com' } },
    create: {
      organizationId: org.id,
      email: 'nir@hyperguest.com',
      passwordHash,
      name: 'Nir',
      role: 'super',
    },
    update: { role: 'super' },
  })
  console.log(`✓ AdminUser: ${admin.email} (role=${admin.role})`)

  // ── Default property ──────────────────────────────────────────────────────
  await prisma.property.upsert({
    where: { propertyId: 19912 },
    create: { organizationId: org.id, propertyId: 19912, isDefault: true },
    update: {},
  })
  console.log('✓ Property: 19912')

  // ── Default hotel config ──────────────────────────────────────────────────
  await prisma.hotelConfig.upsert({
    where: { propertyId: 19912 },
    create: {
      propertyId: 19912,
      displayName: 'The Grand Certification Hotel',
      tagline: 'Your perfect stay, directly booked',
      heroImageUrl: 'https://hg-static.hyperguest.com/19912/images/image_1813791_original.jpg',
      logoUrl: null,
      defaultCurrency: 'EUR',
      defaultLocale: 'en',
      enabledLocales: '["en","de","fr","es","it"]',
      enabledCurrencies: '["EUR","USD","GBP"]',
      colorPrimary: '#0f509e',
      colorPrimaryHover: '#0a3a7a',
      colorPrimaryLight: '#e8f0fb',
      colorAccent: '#1399cd',
      colorBackground: '#f2f3ef',
      colorSurface: '#ffffff',
      colorText: '#211c18',
      colorTextMuted: '#717171',
      colorBorder: '#e0e0e0',
      colorSuccess: '#308c67',
      colorError: '#de1f27',
      fontFamily: 'Roboto',
      borderRadius: 8,
      onlinePaymentEnabled: true,
      payAtHotelEnabled: true,
      payAtHotelCardGuaranteeRequired: false,
    },
    update: {},
  })
  console.log('✓ HotelConfig for property 19912')
}

seed()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
