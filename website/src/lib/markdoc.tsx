import fs from 'node:fs'
import path from 'node:path'

import Markdoc, { type Node, type Schema, renderers } from '@markdoc/markdoc'
import yaml from 'js-yaml'
import React from 'react'

import * as markdocConfig from '@/markdoc/config'
import nodes from '@/markdoc/nodes'
import tags from '@/markdoc/tags'

// This module replaces `@markdoc/next.js`. That package shipped a webpack
// loader that turned `page.md` files into route modules, but the modules it
// emitted are classified as Client Components by Next 16.2+, which makes the
// `metadata` export illegal and fails the build. The package is unmaintained
// (0.5.0, July 2025), so instead of a `.md` page we read and transform the
// markdown from a real Server Component. The Markdoc parser itself is fine and
// is still doing all the work here; only the build-time integration is gone.

const CONTENT_ROOT = path.join(process.cwd(), 'content')

export type Frontmatter = Record<string, string | undefined> & {
  title?: string
  nextjs?: { metadata?: Record<string, unknown> }
}

/**
 * Markdoc schemas register components by reference (`render: Callout`), but the
 * React renderer resolves components by name against a lookup map. Swap each
 * reference for a stable name and collect the map, which is what
 * `@markdoc/next.js/runtime` did for us before.
 */
// Markdoc instantiates these at runtime with props derived from each node's
// attributes, so the registry is genuinely heterogeneous: MarkdocLayout takes
// {children, frontmatter, nodes} while Fence takes {children, language}. There
// is no single prop type that fits, hence `any` here rather than a fiction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RenderComponent = React.ComponentType<any>

/** A schema entry as authored in `src/markdoc/*`: `render` is a component. */
type AuthoredSchema = Omit<Schema, 'render'> & { render?: RenderComponent }

/** A schema entry as Markdoc wants it: `render` is a component *name*. */
type NamedSchema = Schema

function pascalCase(name: string): string {
  return (name.match(/[a-z]+/gi) ?? [])
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

function registerComponents(schema: Record<string, AuthoredSchema>) {
  const output: Record<string, NamedSchema> = {}
  const components: Record<string, RenderComponent> = {}

  for (const [name, registration] of Object.entries(schema)) {
    const { render, ...rest } = registration

    if (!render) {
      output[name] = rest as NamedSchema
      continue
    }

    // Pascal-case the schema key so two registrations can't collide.
    const componentName = pascalCase(name)
    output[name] = { ...rest, render: componentName } as NamedSchema
    components[componentName] = render
  }

  return { output, components }
}

function contentPath(collection: string, slug: string) {
  return path.join(CONTENT_ROOT, collection, `${slug}.md`)
}

export function listSlugs(collection: string): Array<string> {
  return fs
    .readdirSync(path.join(CONTENT_ROOT, collection))
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.replace(/\.md$/, ''))
    .filter((slug) => slug !== 'index')
    .sort()
}

export function readFrontmatter(collection: string, slug: string): Frontmatter {
  const source = fs.readFileSync(contentPath(collection, slug), 'utf8')
  const ast = Markdoc.parse(source)
  return (ast.attributes.frontmatter
    ? yaml.load(ast.attributes.frontmatter)
    : {}) as Frontmatter
}

/**
 * Parse and transform one markdown file, then hand the result to the React
 * renderer. The schema's `document` node renders `MarkdocLayout`, so the
 * returned tree already includes the docs or blog chrome and the page component
 * only has to render it.
 */
export function renderMarkdoc(collection: string, slug: string) {
  const source = fs.readFileSync(contentPath(collection, slug), 'utf8')
  const ast = Markdoc.parse(source)

  const frontmatter = (ast.attributes.frontmatter
    ? yaml.load(ast.attributes.frontmatter)
    : {}) as Frontmatter

  const { output: nodeSchema, components: nodeComponents } =
    registerComponents(nodes as Record<string, AuthoredSchema>)
  const { output: tagSchema, components: tagComponents } = registerComponents(
    tags as Record<string, AuthoredSchema>,
  )

  const content = Markdoc.transform(ast, {
    nodes: nodeSchema,
    tags: tagSchema,
    variables: {
      ...markdocConfig.variables,
      markdoc: { frontmatter },
    },
  })

  return {
    frontmatter,
    nodes: ast.children as Array<Node>,
    rendered: renderers.react(content, React, {
      components: { ...nodeComponents, ...tagComponents },
    }),
  }
}

/** Build the Next `metadata` export from a page's `nextjs.metadata` frontmatter. */
export function metadataFor(collection: string, slug: string) {
  return readFrontmatter(collection, slug).nextjs?.metadata ?? {}
}
