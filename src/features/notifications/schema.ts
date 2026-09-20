import { z } from 'zod'
import { paginationQuerySchema } from '../../db/schema/common'

export const listNotificationsQuerySchema = paginationQuerySchema

export type ListNotificationsQueryInput = z.infer<typeof listNotificationsQuerySchema>
