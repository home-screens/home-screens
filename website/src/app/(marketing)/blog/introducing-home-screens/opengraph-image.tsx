import { blogOgAlt, createBlogOgImage, ogContentType, ogSize } from '@/lib/og'

export const runtime = 'nodejs'
export const dynamic = 'force-static'
export const alt = blogOgAlt('introducing-home-screens')
export const size = ogSize
export const contentType = ogContentType
export default createBlogOgImage('introducing-home-screens')
