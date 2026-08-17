import { eq, sql } from 'drizzle-orm'
import { client, db, admins, type AdminRole } from './index'
import { env } from '../config/env'
import { hashPassword } from '../lib/password'

async function seedAdmin() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error('Missing ADMIN_EMAIL or ADMIN_PASSWORD in environment variables.')
    process.exit(1)
  }

  const email = env.ADMIN_EMAIL
  const password = env.ADMIN_PASSWORD
  const role = env.ADMIN_ROLE as AdminRole

  try {
    const existing = await db.query.admins.findFirst({
      where: eq(sql`lower(${admins.email})`, email),
    })

    if (existing) {
      console.log(`Admin with email "${email}" already exists (ID: ${existing.id.toString()}, Role: ${existing.role})`)
      return
    }

    const passwordHash = await hashPassword(password)

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

    console.log(`Admin created: ${newAdmin.email} (${newAdmin.role})`)
  } catch (error) {
    console.error('Admin seed failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

seedAdmin()
