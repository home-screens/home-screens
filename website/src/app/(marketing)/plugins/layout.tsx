import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

export default function PluginsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="pt-[4.25rem]">{children}</main>
      <Footer />
    </>
  )
}
