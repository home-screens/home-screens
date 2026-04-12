import type { Metadata } from 'next'

import { BlogList } from '@/components/BlogList'
import { Container } from '@/components/Container'
import { getAllPosts, getCategories } from '@/lib/blog'

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'News, guides, and updates from the Home Screens project.',
  openGraph: {
    title: 'Blog — Home Screens',
    description: 'News, guides, and updates from the Home Screens project.',
    url: 'https://homescreens.dev/blog',
  },
  alternates: {
    canonical: 'https://homescreens.dev/blog',
  },
}

export default function BlogPage() {
  const posts = getAllPosts()
  const categories = getCategories()

  return (
    <Container className="py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-white sm:text-5xl">
          Blog
        </h1>
        <p className="mt-4 text-lg/8 text-neutral-400">
          News, guides, and updates from the Home Screens project.
        </p>
      </div>

      <BlogList posts={posts} categories={categories} />
    </Container>
  )
}
