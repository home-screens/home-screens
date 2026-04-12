import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Header />
      <main className="pt-20">
        {children}
      </main>
      <Footer />
    </>
  )
}
