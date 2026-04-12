import Link from 'next/link'

import type { BlogPost } from '@/lib/blog'

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function BlogCard({ post }: { post: BlogPost }) {
  return (
    <article className="flex flex-col items-start justify-between">
      {post.image && (
        <Link href={post.href} className="relative w-full">
          <img
            alt=""
            src={post.image}
            className="aspect-video w-full rounded-2xl bg-neutral-800 object-cover"
          />
          <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
        </Link>
      )}
      <div className="flex max-w-xl grow flex-col justify-between">
        <div className={`${post.image ? 'mt-8' : ''} flex items-center gap-x-4 text-xs`}>
          <time dateTime={post.date} className="text-neutral-500">
            {formatDate(post.date)}
          </time>
          <span className="rounded-full bg-white/5 px-3 py-1.5 font-medium text-neutral-300 ring-1 ring-white/10">
            {post.category}
          </span>
        </div>
        <div className="group relative grow">
          <h3 className="mt-3 text-lg/6 font-semibold text-white group-hover:text-neutral-300">
            <Link href={post.href}>
              <span className="absolute inset-0" />
              {post.title}
            </Link>
          </h3>
          <p className="mt-5 line-clamp-3 text-sm/6 text-neutral-400">
            {post.description}
          </p>
        </div>
        <p className="mt-6 text-sm text-neutral-500">
          {post.author}
        </p>
      </div>
    </article>
  )
}
