/**
 * User onboarding & invite defaults
 */
export const INITIAL_USER_INVITES_COUNT = 5
export const INITIAL_USER_INVITES_TTL_DAYS = 56
export const INITIAL_USER_INVITES_TTL_MS = INITIAL_USER_INVITES_TTL_DAYS * 24 * 60 * 60 * 1000

/**
 * Session durations
 */
export const SESSION_TTL_DAYS = 360
export const ADMIN_SESSION_TTL_DAYS = 30
export const ADMIN_COOKIE_NAME = 'admin_session'

/**
 * Content editing and feed limits
 */
export const CONTENT_EDIT_WINDOW_MINUTES = 15
export const CONTENT_EDIT_WINDOW_MS = CONTENT_EDIT_WINDOW_MINUTES * 60 * 1000
export const MAX_FEED_POSTS_PER_24_HOURS = 3

/**
 * Media uploads
 */
export const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
export const DEFAULT_PRESIGN_TTL_SECONDS = 900 // 15 minutes

/**
 * Regular readers window
 */
export const REGULAR_READERS_WINDOW_DAYS = 180
