#!/usr/bin/env node
/**
 * Emergency script to set (or reset) a password for an admin user.
 *
 * Run on Render shell (from /repo):
 *   node apps/api/scripts/set-admin-password.mjs <email> <new-password>
 */

import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const [,, email, newPassword] = process.argv

if (!email || !newPassword) {
  console.error('Usage: node set-admin-password.mjs <email> <new-password>')
  process.exit(1)
}

if (newPassword.length < 8) {
  console.error('Password must be at least 8 characters')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  const user = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase() },
    include: { organization: { select: { hyperGuestOrgId: true, name: true } } },
  })

  if (!user) {
    console.error(`No admin user found with email: ${email}`)
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash } })

  console.log(`✅ Password updated for ${email} (role: ${user.role})`)

  if (user.role === 'super') {
    console.log('   Login with HyperGuest Org ID: 1')
  } else if (user.organization?.hyperGuestOrgId) {
    console.log(`   Login with HyperGuest Org ID: ${user.organization.hyperGuestOrgId}`)
  } else {
    console.log('   Note: your organization has no HyperGuest Org ID set — email/password login requires one.')
  }
} finally {
  await prisma.$disconnect()
}
