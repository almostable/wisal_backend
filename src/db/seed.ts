import { client, db, accounts } from './index'
import { hashPassword } from '../lib/password'
import { createSession } from '../lib/session'

async function seed() {
  console.log('🌱 Seeding database...')

  try {
    const passwordHash = await hashPassword('AdminPass123!')

    // 1. Seed Account (Snowflake ID generated automatically via $defaultFn)
    const [account] = await db
      .insert(accounts)
      .values({
        email: 'admin@wisal.dev',
        password: passwordHash,
      })
      .onConflictDoNothing()
      .returning()

    if (account) {
      console.log('   👤 Account seeded:', account.email)
      const { token } = await createSession(account.id)
      console.log('   🔑 Seed Session Token:', token)
    } else {
      console.log('   👤 Account admin@wisal.dev already exists')
    }

    console.log('✅ Seeding completed!')
  } catch (error) {
    console.error('❌ Seeding failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

seed()
