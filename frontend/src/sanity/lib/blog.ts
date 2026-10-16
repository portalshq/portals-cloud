import {cache} from 'react'
import type {BlogPost, BlogPostCard} from '@/types/blog'
import {sanityDocumentClient} from './client'
import {BLOG_POSTS_QUERY, BLOG_POST_BY_SLUG_QUERY, BLOG_POST_SLUGS_QUERY} from './queries'

// `cache` dedupes the list fetch between the marketing layout (breadcrumb
// labels) and the page itself within one request.
export const getBlogPosts = cache(async (): Promise<BlogPostCard[]> => {
  return sanityDocumentClient.fetch<BlogPostCard[]>(BLOG_POSTS_QUERY)
})

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  return sanityDocumentClient.fetch<BlogPost | null>(BLOG_POST_BY_SLUG_QUERY, {slug})
}

export async function getBlogSlugs(): Promise<Array<{slug: string}>> {
  return sanityDocumentClient.fetch<Array<{slug: string}>>(BLOG_POST_SLUGS_QUERY)
}
