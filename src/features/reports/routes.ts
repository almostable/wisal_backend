import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware } from '../../middleware/auth'
import { onboardingMiddleware } from '../../middleware/onboarding'
import { stringToSnowflake } from '../../lib/snowflake'
import {
  createReportSchema,
  listUserReportsQuerySchema,
  reportIdParamSchema,
} from './schema'
import {
  createReport,
  listUserReports,
  getUserReportById,
} from './service'

export const reportsRouter = new Hono()

reportsRouter.use('*', authMiddleware, onboardingMiddleware)

reportsRouter.post('/', zValidator('json', createReportSchema), async (c) => {
  const profile = c.get('profile')
  const data = c.req.valid('json')

  const report = await createReport(profile.id, data)

  return c.json(
    {
      success: true,
      report,
    },
    201
  )
})

reportsRouter.get('/', zValidator('query', listUserReportsQuerySchema), async (c) => {
  const profile = c.get('profile')
  const query = c.req.valid('query')

  const result = await listUserReports(profile.id, query)

  return c.json({
    success: true,
    ...result,
  })
})

reportsRouter.get('/:id', zValidator('param', reportIdParamSchema), async (c) => {
  const profile = c.get('profile')
  const { id } = c.req.valid('param')
  const reportId = stringToSnowflake(id)

  const report = await getUserReportById(profile.id, reportId)

  return c.json({
    success: true,
    report,
  })
})
