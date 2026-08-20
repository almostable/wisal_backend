import type { PostType, GenderScope, AccessLevel } from '../../db/schema/posts'

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
  createdAt: Date
  updatedAt: Date
  author?: PostAuthorInfo | null
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
