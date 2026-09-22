import type {BlogPost, BlogPostCard} from '@/types/blog'
import {sanityDocumentClient} from './client'
import {BLOG_POSTS_QUERY, BLOG_POST_BY_SLUG_QUERY, BLOG_POST_SLUGS_QUERY} from './queries'

export async function getBlogPosts(): Promise<BlogPostCard[]> {
  return sanityDocumentClient.fetch<BlogPostCard[]>(BLOG_POSTS_QUERY)
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  return sanityDocumentClient.fetch<BlogPost | null>(BLOG_POST_BY_SLUG_QUERY, {slug})
}

export async function getBlogSlugs(): Promise<Array<{slug: string}>> {
  return sanityDocumentClient.fetch<Array<{slug: string}>>(BLOG_POST_SLUGS_QUERY)
}
