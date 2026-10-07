import type { Metadata } from 'next'

import { Container } from '@/components/Container'
import { SubmitPlugin } from '@/components/plugins/SubmitPlugin'
import { getLatestStableVersion } from '@/lib/changelog'

const DESCRIPTION =
  'Get your Home Screens plugin listed. Paste the GitHub repo, we check the manifest and release, and prepare the registry request.'

export const metadata: Metadata = {
  title: 'Submit a plugin',
  description: DESCRIPTION,
  alternates: { canonical: 'https://homescreens.dev/plugins/submit' },
  openGraph: { title: 'Submit a Home Screens plugin', description: DESCRIPTION, url: 'https://homescreens.dev/plugins/submit' },
  twitter: { title: 'Submit a Home Screens plugin', description: DESCRIPTION },
  robots: { index: false },
}

export default function SubmitPluginPage() {
  const currentAppVersion = getLatestStableVersion().replace(/^v/, '')
  return (
    <Container>
      <SubmitPlugin currentAppVersion={currentAppVersion} />
    </Container>
  )
}
