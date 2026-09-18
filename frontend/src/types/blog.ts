import type {PortableTextBlock} from './resource'

export type BlogFaq = {question: string; answer: string}

export type BlogPostCard = {
  _id: string
  _updatedAt: string
  title: string
  slug: string
  definition: string
  excerpt: string
  publishedAt: string
  cluster?: string
  priority?: number
  tags?: string[]
  coverImageUrl?: string
  keyTakeaways?: string[]
}

export type BlogPost = BlogPostCard & {
  authors?: Array<{name: string; role?: string}>
  seo?: {
    metaTitle?: string
    metaDescription?: string
    keywords?: string[]
    shareTitle?: string
    shareDescription?: string
    shareImageUrl?: string
    canonicalPath?: string
    noIndex?: boolean
  }
  body: PortableTextBlock[]
  faqs?: BlogFaq[]
  relatedPosts?: BlogPostCard[]
}
