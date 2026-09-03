'use client'

import { useState } from 'react'

import type { BlogPost } from '@/lib/blog'
import { BlogCard } from '@/components/BlogCard'

export function BlogList({
  posts,
  categories,
}: {
  posts: BlogPost[]
  categories: string[]
}) {
  const [active, setActive] = useState<string | null>(null)

  const filtered = active ? posts.filter((p) => p.category === active) : posts

  return (
    <>
      {posts.length > 5 && categories.length > 1 && (
        <div className="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-2 lg:max-w-none">
          <button
            onClick={() => setActive(null)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active === null
                ? 'bg-white/10 text-white ring-1 ring-white/20'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActive(active === cat ? null : cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active === cat
                  ? 'bg-white/10 text-white ring-1 ring-white/20'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
        {filtered.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-16 text-center text-neutral-500">
          No posts yet. Check back soon.
        </p>
      )}
    </>
  )
}
