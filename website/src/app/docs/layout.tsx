import { Layout } from '@/components/docs/Layout'

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <Layout>{children}</Layout>
}
