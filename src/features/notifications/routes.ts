import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware } from '../../middleware/auth'
import { onboardingMiddleware } from '../../middleware/onboarding'
import { listNotificationsQuerySchema } from './schema'
import {
  getNotifications,
  getUnreadNotificationsCount,
  markNotificationsAsRead,
} from './service'

export const notificationsRouter = new Hono()

notificationsRouter.use('*', authMiddleware, onboardingMiddleware)

notificationsRouter.get('/', zValidator('query', listNotificationsQuerySchema), async (c) => {
  const profile = c.get('profile')
  const query = c.req.valid('query')
  const result = await getNotifications(profile.id, query)

  return c.json({
    success: true,
    ...result,
  })
})

notificationsRouter.get('/unread-count', async (c) => {
  const profile = c.get('profile')
  const result = await getUnreadNotificationsCount(profile.id)

  return c.json({
    success: true,
    ...result,
  })
})

notificationsRouter.post('/read', async (c) => {
  const profile = c.get('profile')
  const result = await markNotificationsAsRead(profile.id)

  return c.json(result)
})
