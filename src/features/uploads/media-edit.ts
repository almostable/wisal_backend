import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { mediaItemSchema, removableCommentMediaPayloadSchema, removablePostMediaPayloadSchema } from './schema'

export function getMediaFileKeys(payload: Record<string, unknown>): string[] {
  const parsed = z.object({ media: z.array(mediaItemSchema) }).safeParse(payload)
  return parsed.success ? parsed.data.media.map((item) => item.fileKey) : []
}

export function validateMediaRemoval(
  currentPayload: Record<string, unknown>,
  requestedPayload: Record<string, unknown>,
  entityType: 'post' | 'comment'
): { payload: { media: z.infer<typeof mediaItemSchema>[] }; oldFileKeys: string[]; newFileKeys: string[] } {
  const payloadSchema = entityType === 'post'
    ? removablePostMediaPayloadSchema : removableCommentMediaPayloadSchema
  const requested = payloadSchema.safeParse(requestedPayload)
  const current = payloadSchema.safeParse(currentPayload)

  if (!requested.success || !current.success || current.data.media.length === 0) {
    throw new HTTPException(400, { message: 'Media edit must only remove existing files' })
  }

  const oldMedia = current.data.media
  const newMedia = requested.data.media
  let previousIndex = -1
  for (const item of newMedia) {
    const index = oldMedia.findIndex((old, position) =>
      position > previousIndex && old.fileKey === item.fileKey &&
      old.width === item.width && old.height === item.height
    )
    if (index < 0) {
      throw new HTTPException(400, { message: 'Media edit must only remove existing files' })
    }
    previousIndex = index
  }

  return {
    payload: requested.data,
    oldFileKeys: oldMedia.map((item) => item.fileKey),
    newFileKeys: newMedia.map((item) => item.fileKey),
  }
}
