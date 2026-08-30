import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware } from '../../middleware/auth'
import { presignRequestSchema } from './schema'
import { generateUploadPresignedUrl } from './service'

export const uploadsRouter = new Hono()

uploadsRouter.use('*', authMiddleware)

uploadsRouter.post('/presign', zValidator('json', presignRequestSchema), async (c) => {
  const input = c.req.valid('json')
  const result = await generateUploadPresignedUrl(input)

  return c.json(
    {
      success: true,
      uploadUrl: result.uploadUrl,
      fileKey: result.fileKey,
      expiresIn: result.expiresIn,
    },
    200
  )
})
