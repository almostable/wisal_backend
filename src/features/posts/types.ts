import type { PostType, GenderScope, MediaItem, MediaPayload } from '../../db/schema/posts'
import type { CommentType } from '../../db/schema/comments'

export type { MediaItem, MediaPayload }

export interface PostAuthorInfo {
  id?: bigint
  name: string | null
  identity: string | null
  avatarKey: string | null
  isMale?: boolean | null
  isVerified?: boolean
  isReading?: boolean
  isDeleted?: boolean
}

export interface PostResponse {
  id: bigint
  authorId: bigint
  type: PostType
  payload: Record<string, unknown>
  content: string
  genderScope: GenderScope
  isFeed?: boolean
  isPinned: boolean
  savesCount?: number
  likesCount?: number
  commentsCount: number
  viewsCount?: number
  isSaved?: boolean
  isLiked?: boolean
  createdAt: Date
  updatedAt: Date
  editedAt: Date | null
  author?: PostAuthorInfo | null
}

export interface CommentAuthorInfo {
  id: bigint
  name: string | null
  identity: string | null
  avatarKey: string | null
  isMale?: boolean | null
  isBlocked?: boolean
  isHidden?: boolean
  isDeleted?: boolean
}

export interface ReplyToProfileInfo {
  id: bigint
  name: string | null
  identity: string | null
  isDeleted?: boolean
}

export interface CommentResponse {
  id: bigint
  postId: bigint
  authorId: bigint
  parentId: bigint | null
  replyToCommentId?: bigint | null
  replyToProfile?: ReplyToProfileInfo | null
  type: CommentType
  payload: Record<string, unknown>
  content: string
  repliesCount: number
  createdAt: Date
  updatedAt: Date
  editedAt: Date | null
  author?: CommentAuthorInfo | null
  isBlocked?: boolean
  isHidden?: boolean
}

export interface SaveActionResult {
  saved: boolean
  savesCount?: number
  message: string
}

export interface LikeActionResult {
  liked: boolean
  likesCount?: number
  message: string
}

export interface CreatePostDTO {
  content?: string | null
  type?: PostType
  payload?: Record<string, unknown>
  genderScope?: GenderScope
  isFeed?: boolean
  showInFeed?: boolean
  isPinned?: boolean
}

export interface UpdatePostDTO {
  content?: string | null
  type?: PostType
  genderScope?: GenderScope
  isFeed?: boolean
  showInFeed?: boolean
  isPinned?: boolean
  payload?: Record<string, unknown>
}

export interface PinPostDTO {
  isPinned?: boolean
}

export interface UserPostsQueryDTO {
  limit?: number
  offset?: number
}

export interface UserPostsResult {
  posts: PostResponse[]
  total: number
  limit: number
  offset: number
}

export interface SavedPostsQueryDTO {
  limit?: number
  offset?: number
}

export interface SavedPostsResult {
  posts: PostResponse[]
  total: number
  limit: number
  offset: number
}

export interface CreateCommentDTO {
  content?: string | null
  parentId?: bigint | null
  type?: CommentType
  payload?: Record<string, unknown>
}

export interface UpdateCommentDTO {
  content?: string | null
  payload?: Record<string, unknown>
}

export interface ListCommentsQueryDTO {
  limit?: number
  offset?: number
}

export interface ListCommentsResult {
  comments: CommentResponse[]
  total: number
  limit: number
  offset: number
}

export interface DeleteCommentResult {
  success: boolean
  message: string
}

export interface RecordViewsDTO {
  postIds: string[]
}

export interface RecordViewsResult {
  success: boolean
  updatedCount: number
}

export interface FeedQueryDTO {
  limit?: number
  offset?: number
  cursor?: string
}

export interface FeedPostsResult {
  posts: PostResponse[]
  total: number
  limit: number
  offset: number
  nextCursor?: string | null
  hasMore: boolean
}

