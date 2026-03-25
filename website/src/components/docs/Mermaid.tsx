'use client'

import { useEffect, useId, useState } from 'react'
import { Dialog, DialogPanel } from '@headlessui/react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  darkMode: true,
  fontFamily: 'var(--font-sans)',
  themeVariables: {
    primaryColor: '#0ea5e9',
    primaryTextColor: '#f8fafc',
    primaryBorderColor: '#38bdf8',
    lineColor: '#64748b',
    secondaryColor: '#1e293b',
    tertiaryColor: '#0f172a',
    background: '#0f172a',
    mainBkg: '#1e293b',
    nodeBorder: '#38bdf8',
    clusterBkg: '#1e293b',
    clusterBorder: '#334155',
    titleColor: '#f8fafc',
    edgeLabelBackground: '#1e293b',
    nodeTextColor: '#f8fafc',
  },
})

function ExpandIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M13.28 7.78l3.22-3.22v2.69a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.69l-3.22 3.22a.75.75 0 001.06 1.06zM2 17.25v-4.5a.75.75 0 011.5 0v2.69l3.22-3.22a.75.75 0 011.06 1.06L4.56 16.5h2.69a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" />
    </svg>
  )
}

// Strip fixed width/height from SVG so it scales to fill its container
function makeScalable(svgString: string): string {
  return svgString
    .replace(/(<svg[^>]*)\sheight="[^"]*"/, '$1')
    .replace(/(<svg[^>]*)\swidth="[^"]*"/, '$1')
    .replace(/(<svg[^>]*)\sstyle="[^"]*"/, '$1 style="width:100%;height:auto"')
}

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, '-')
  const [svg, setSvg] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        const { svg } = await mermaid.render(`mermaid-${id}`, chart)
        if (!cancelled) {
          setSvg(svg)
        }
      } catch {
        if (!cancelled) {
          setSvg('')
        }
      }
    }

    render()

    return () => {
      cancelled = true
    }
  }, [chart, id])

  if (!svg) {
    return (
      <pre className="rounded-xl bg-slate-900 p-4 text-sm text-slate-400 overflow-x-auto">
        <code>{chart}</code>
      </pre>
    )
  }

  const scaledSvg = makeScalable(svg)

  return (
    <>
      <div
        className="group relative my-6 cursor-pointer overflow-x-auto rounded-xl bg-slate-900/50 p-6 transition-colors hover:bg-slate-900/70 dark:bg-slate-800/40 dark:hover:bg-slate-800/60"
        onClick={() => setIsOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen(true)
          }
        }}
        aria-label="Click to expand diagram"
      >
        <div
          className="flex justify-center [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md bg-slate-800/80 px-2 py-1 text-xs text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
          <ExpandIcon className="h-3.5 w-3.5" />
          Click to expand
        </div>
      </div>

      <Dialog open={isOpen} onClose={() => setIsOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" aria-hidden="true" />
        <div
          className="fixed inset-0 flex items-center justify-center p-6 sm:p-10 lg:p-16"
          onClick={() => setIsOpen(false)}
        >
          <DialogPanel
            className="w-full max-w-6xl overflow-auto rounded-2xl bg-slate-900 p-8 sm:p-12 shadow-2xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-full [&_svg]:w-full [&_svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: scaledSvg }}
            />
            <p className="mt-6 text-center text-xs text-slate-500">
              Press <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-400">Esc</kbd> or click outside to close
            </p>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  )
}
