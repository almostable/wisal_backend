import type { PostType, GenderScope, AccessLevel } from '../../db/schema/posts'
import type { CommentType } from '../../db/schema/comments'

export interface PostAuthorInfo {
  id: bigint
  name: string | null
  identity: string | null
  avatarKey: string | null
  isMale: boolean | null
}

export interface PostResponse {
  id: bigint
  authorId: bigint
  authorGender: boolean
  type: PostType
  payload: Record<string, unknown>
  content: string
  genderScope: GenderScope
  accessLevel: AccessLevel
  isPinned: boolean
  likesCount: number
  commentsCount: number
  isLiked?: boolean
  createdAt: Date
  updatedAt: Date
  author?: PostAuthorInfo | null
}

export interface CommentAuthorInfo {
  id: bigint
  name: string | null
  identity: string | null
  avatarKey: string | null
  isMale: boolean | null
}

export interface CommentResponse {
  id: bigint
  postId: bigint
  authorId: bigint
  parentId: bigint | null
  type: CommentType
  payload: Record<string, unknown>
  content: string
  createdAt: Date
  updatedAt: Date
  author?: CommentAuthorInfo | null
}

export interface LikeActionResult {
  liked: boolean
  likesCount: number
  message: string
}

export interface CreatePostDTO {
  content: string
  type?: PostType
  payload?: Record<string, unknown>
  genderScope?: GenderScope
  accessLevel?: AccessLevel
  isPinned?: boolean
}

export interface UpdatePostDTO {
  content?: string
  genderScope?: GenderScope
  accessLevel?: AccessLevel
  isPinned?: boolean
  payload?: Record<string, unknown>
}

export interface PinPostDTO {
  isPinned?: boolean
}

export interface FeedQueryDTO {
  feed?: 'public' | 'following'
  type?: 'public' | 'following'
  limit?: number
  offset?: number
}

export interface UserPostsQueryDTO {
  limit?: number
  offset?: number
}

export interface FeedResult {
  posts: PostResponse[]
  limit: number
  offset: number
}

export interface UserPostsResult {
  posts: PostResponse[]
  total: number
  limit: number
  offset: number
}

export interface CreateCommentDTO {
  content: string
  parentId?: bigint | null
  type?: CommentType
  payload?: Record<string, unknown>
}

export interface ReplyCommentDTO {
  content: string
  type?: CommentType
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
