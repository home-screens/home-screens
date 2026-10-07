import Markdoc, { nodes as defaultNodes, Tag, renderers, type Config } from '@markdoc/markdoc'
import { slugifyWithCounter } from '@sindresorhus/slugify'
import React, { type ReactNode } from 'react'

import { Fence } from '@/components/docs/Fence'
import { FENCE_PLACEHOLDER_PREFIX, prepareReadme, resolveReadmeUrl } from './plugin-readme'

/**
 * Renders a plugin README (already prepared by `prepareReadme`) with Markdoc.
 * Unlike the docs pipeline there is no page layout here, only the article
 * body: headings get ids, code keeps its exact text, and relative links and
 * images point back at the repo on GitHub.
 */
function ScrollingTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  )
}

function ReadmeImage({ src, alt, title }: { src: string; alt?: string; title?: string }) {
  // Sizes are unknown for a picture that lives in someone else's repo, so the
  // image is boxed by width and keeps its own ratio once it loads.
  return (
    <img src={src} alt={alt ?? ''} title={title} loading="lazy" decoding="async" className="max-w-full rounded-lg" />
  )
}

export function renderReadme(markdown: string, repo: string): ReactNode | null {
  const prepared = prepareReadme(markdown)
  if (!prepared.markdown) return null

  const slugify = slugifyWithCounter()

  const config: Config = {
    variables: { repo },
    nodes: {
      document: {
        ...defaultNodes.document,
        render: 'div',
        transform(node, cfg) {
          return new Tag('div', {}, node.transformChildren(cfg))
        },
      },
      heading: {
        ...defaultNodes.heading,
        transform(node, cfg) {
          const attributes = node.transformAttributes(cfg)
          const children = node.transformChildren(cfg)
          const text = children.filter((child) => typeof child === 'string').join(' ')
          return new Tag(`h${node.attributes.level}`, { ...attributes, id: slugify(text) }, children)
        },
      },
      table: { ...defaultNodes.table, render: 'ScrollingTable' },
      fence: {
        attributes: {
          content: { type: String, render: false, required: true },
          language: { type: String },
        },
        transform(node, cfg) {
          const attributes = node.transformAttributes(cfg)
          const raw = String(node.attributes.content ?? '').trim()
          const index = raw.startsWith(FENCE_PLACEHOLDER_PREFIX)
            ? Number(raw.slice(FENCE_PLACEHOLDER_PREFIX.length))
            : NaN
          const content = Number.isInteger(index) ? prepared.fences[index] ?? raw : raw
          return new Tag('Fence', { language: attributes.language ?? '' }, [content])
        },
      },
      link: {
        ...defaultNodes.link,
        transform(node, cfg) {
          const attributes = node.transformAttributes(cfg)
          const href = resolveReadmeUrl(String(attributes.href ?? ''), repo, 'link')
          const external = /^https?:\/\//.test(href) && !href.startsWith('https://homescreens.dev')
          return new Tag(
            'a',
            { ...attributes, href, ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) },
            node.transformChildren(cfg),
          )
        },
      },
      image: {
        ...defaultNodes.image,
        transform(node, cfg) {
          const attributes = node.transformAttributes(cfg)
          return new Tag('ReadmeImage', {
            src: resolveReadmeUrl(String(attributes.src ?? ''), repo, 'image'),
            alt: attributes.alt,
            title: attributes.title,
          })
        },
      },
    },
  }

  const ast = Markdoc.parse(prepared.markdown)
  const content = Markdoc.transform(ast, config)
  return renderers.react(content, React, {
    components: { Fence, ScrollingTable, ReadmeImage },
  })
}
