import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ImageResponse } from 'next/og'

import { createElement } from 'react'

import { LogoMark } from '@/components/LogoMark'
import { getAllPosts } from './blog'
import { navigation } from './docs-navigation'
import { loadIconNode } from './plugin-icon-data'
import { getDirectoryPlugin } from './plugins'

export const ogSize = { width: 1200, height: 630 }
export const ogContentType = 'image/png'

const fontsDir = join(process.cwd(), 'src', 'fonts')
const interRegularData = readFileSync(
  join(fontsDir, 'inter-latin-400-normal.woff'),
)
const interBoldData = readFileSync(
  join(fontsDir, 'inter-latin-700-normal.woff'),
)

function findPageInfo(slug: string): { title: string; section: string } {
  const href = slug ? `/docs/${slug}` : '/docs'
  for (const group of navigation) {
    for (const link of group.links) {
      if (link.href === href) {
        return { title: link.title, section: group.title }
      }
    }
  }
  return { title: 'Documentation', section: '' }
}

export function docsOgAlt(slug: string): string {
  const { title } = findPageInfo(slug)
  return `Home Screens Documentation — ${title}`
}

export function createDocsOgImage(slug: string) {
  const { title, section } = findPageInfo(slug)

  return async function OgImage() {
    return createOgImage({ title, section, sectionLabel: 'Documentation' })
  }
}

function findBlogPostInfo(slug: string): { title: string; category: string } {
  const posts = getAllPosts()
  const post = posts.find((p) => p.slug === slug)
  return post
    ? { title: post.title, category: post.category }
    : { title: 'Blog', category: '' }
}

export function blogOgAlt(slug: string): string {
  const { title } = findBlogPostInfo(slug)
  return `Home Screens Blog — ${title}`
}

export function createBlogOgImage(slug: string) {
  const { title, category } = findBlogPostInfo(slug)
  return async function OgImage() {
    return createOgImage({ title, section: category, sectionLabel: 'Blog' })
  }
}

/** A plugin page's card: its icon, name, author and category. */
export async function createPluginOgImage(id: string) {
  const plugin = await getDirectoryPlugin(id)
  if (!plugin) {
    return createOgImage({ title: 'Plugins', section: '', sectionLabel: 'Plugins' })
  }
  const node = await loadIconNode(plugin.icon)
  return createOgImage({
    title: plugin.name,
    section: plugin.category,
    sectionLabel: 'Plugins',
    subtitle: `by ${plugin.author}${plugin.verified ? ' · Verified by the Home Screens team' : ''}`,
    icon: node ? (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={72}
        height={72}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#67E8F9"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {node.map(([tag, attrs], i) => createElement(tag, { ...attrs, key: i }))}
      </svg>
    ) : undefined,
  })
}

function createOgImage({
  title,
  section,
  sectionLabel,
  subtitle,
  icon,
}: {
  title: string
  section: string
  sectionLabel: string
  subtitle?: string
  icon?: React.ReactNode
}) {
  const fontSize = title.length > 24 ? 52 : title.length > 16 ? 60 : 68

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter',
          backgroundImage:
            'linear-gradient(160deg, #0A0E14 0%, #0F1720 50%, #0A1628 100%)',
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            width: '100%',
            height: '4px',
            backgroundImage:
              'linear-gradient(90deg, #0891B2, #67E8F9, #0891B2)',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '48px 64px',
          }}
        >
          {/* Brand header */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <LogoMark size={32} forSatori />
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                marginLeft: '14px',
              }}
            >
              <span
                style={{
                  color: '#67E8F9',
                  fontSize: '15px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                }}
              >
                HOME
              </span>
              <span
                style={{
                  color: '#F5F5F5',
                  fontSize: '17px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  marginLeft: '6px',
                }}
              >
                Screens
              </span>
            </div>
            <span
              style={{
                color: '#334155',
                fontSize: '20px',
                margin: '0 12px',
              }}
            >
              |
            </span>
            <span
              style={{
                color: '#64748B',
                fontSize: '17px',
                fontWeight: 400,
              }}
            >
              {sectionLabel}
            </span>
          </div>

          {/* Title */}
          <div
            style={{
              display: 'flex',
              flex: 1,
              alignItems: 'center',
            }}
          >
            {icon && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '128px',
                  height: '128px',
                  marginRight: '36px',
                  borderRadius: '32px',
                  backgroundColor: 'rgba(103, 232, 249, 0.06)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: 'rgba(103, 232, 249, 0.2)',
                }}
              >
                {icon}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: `${fontSize}px`,
                  fontWeight: 700,
                  color: '#F1F5F9',
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                }}
              >
                {title}
              </span>
              {subtitle && (
                <span
                  style={{
                    marginTop: '16px',
                    fontSize: '24px',
                    color: '#94A3B8',
                  }}
                >
                  {subtitle}
                </span>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            {section ? (
              <div
                style={{
                  display: 'flex',
                  padding: '7px 18px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(103, 232, 249, 0.08)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: 'rgba(103, 232, 249, 0.2)',
                }}
              >
                <span
                  style={{
                    color: '#A5F3FC',
                    fontSize: '15px',
                    fontWeight: 700,
                  }}
                >
                  {section}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex' }} />
            )}
            <span
              style={{
                color: 'rgba(103, 232, 249, 0.45)',
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.02em',
              }}
            >
              homescreens.dev
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: 'Inter', data: interRegularData, weight: 400, style: 'normal' },
        { name: 'Inter', data: interBoldData, weight: 700, style: 'normal' },
      ],
    },
  )
}
