import { blogOgAlt, createBlogOgImage, ogContentType, ogSize } from '@/lib/og'

export const runtime = 'nodejs'
export const dynamic = 'force-static'
export const alt = blogOgAlt('choosing-smart-display-software')
export const size = ogSize
export const contentType = ogContentType
export default createBlogOgImage('choosing-smart-display-software')
