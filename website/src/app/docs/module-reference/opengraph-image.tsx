import { createDocsOgImage, docsOgAlt, ogContentType, ogSize } from '@/lib/og'

export const runtime = 'nodejs'
export const dynamic = 'force-static'
export const alt = docsOgAlt('module-reference')
export const size = ogSize
export const contentType = ogContentType
export default createDocsOgImage('module-reference')
