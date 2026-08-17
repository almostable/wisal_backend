import { eq, sql } from 'drizzle-orm'
import { client, db, admins, type AdminRole } from './index'
import { env } from '../config/env'
import { hashPassword } from '../lib/password'

async function seedAdmin() {
  console.log('🛡️  Running Admin Seed script...')

  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error('❌ Missing ADMIN_EMAIL or ADMIN_PASSWORD in environment variables.')
    console.error('Please set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file.')
    process.exit(1)
  }

  const email = env.ADMIN_EMAIL
  const password = env.ADMIN_PASSWORD
  const role = env.ADMIN_ROLE as AdminRole

  try {
    // 1. Check if admin with lower(email) already exists
    const existing = await db.query.admins.findFirst({
      where: eq(sql`lower(${admins.email})`, email),
    })

    if (existing) {
      console.log(`⚠️  Admin with email "${email}" already exists (ID: ${existing.id.toString()}, Role: ${existing.role})`)
      return
    }

    // 2. Hash password using Argon2id
    const passwordHash = await hashPassword(password)

    // 3. Insert new admin
    const [newAdmin] = await db
      .insert(admins)
      .values({
        email,
        password: passwordHash,
        role,
      })
      .returning()

    if (!newAdmin) {
      throw new Error('Failed to insert admin record into database')
    }

    console.log(`✅ Admin created successfully:`)
    console.log(`   - ID: ${newAdmin.id.toString()}`)
    console.log(`   - Email: ${newAdmin.email}`)
    console.log(`   - Role: ${newAdmin.role}`)
  } catch (error) {
    console.error('❌ Admin seed failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

seedAdmin()
