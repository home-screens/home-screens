import { type Node } from '@markdoc/markdoc'

const SITE_URL = 'https://homescreens.dev'
const ORG_NAME = 'Home Screens'

function getNodeText(node: Node): string {
  let text = ''
  for (const child of node.children ?? []) {
    if (child.type === 'text') {
      text += child.attributes.content
    }
    text += getNodeText(child)
  }
  return text
}

export interface FaqEntry {
  question: string
  answer: string
}

const FAQ_HEADING_PATTERN = /^(frequently asked questions|faq|questions)\b/i

export function extractFaqEntries(nodes: Array<Node>): Array<FaqEntry> {
  const entries: Array<FaqEntry> = []
  let inFaqSection = false
  let currentQuestion: string | null = null
  let currentAnswerParts: Array<string> = []

  function flush() {
    if (currentQuestion && currentAnswerParts.length > 0) {
      const answer = currentAnswerParts.join(' ').replace(/\s+/g, ' ').trim()
      if (answer) {
        entries.push({ question: currentQuestion, answer })
      }
    }
    currentQuestion = null
    currentAnswerParts = []
  }

  for (const node of nodes) {
    if (node.type === 'heading') {
      const level = node.attributes.level as number
      const text = getNodeText(node).trim()
      if (level === 2) {
        flush()
        inFaqSection = FAQ_HEADING_PATTERN.test(text)
        continue
      }
      if (level === 3 && inFaqSection) {
        flush()
        currentQuestion = text
        continue
      }
      if (inFaqSection) {
        flush()
      }
      continue
    }

    if (inFaqSection && currentQuestion) {
      const text = getNodeText(node).trim()
      if (text) {
        currentAnswerParts.push(text)
      }
    }
  }

  flush()
  return entries
}

interface ArticleSchemaInput {
  title: string
  description: string
  date: string
  author: string
  image?: string
  slug: string
}

export function buildArticleSchema(input: ArticleSchemaInput) {
  const url = `${SITE_URL}/blog/${input.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    datePublished: input.date,
    dateModified: input.date,
    author: {
      '@type': 'Person',
      name: input.author,
    },
    publisher: {
      '@type': 'Organization',
      name: ORG_NAME,
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/icon.svg`,
      },
    },
    ...(input.image ? { image: `${SITE_URL}${input.image}` } : {}),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    url,
  }
}

export function buildFaqSchema(entries: Array<FaqEntry>) {
  if (entries.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer,
      },
    })),
  }
}

export function buildBreadcrumbSchema(title: string, slug: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: `${SITE_URL}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: title,
        item: `${SITE_URL}/blog/${slug}`,
      },
    ],
  }
}
