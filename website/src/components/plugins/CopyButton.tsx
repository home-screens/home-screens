'use client'

import clsx from 'clsx'
import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Copies `text` to the clipboard and says so for a moment. */
export function CopyButton({
  text,
  label = 'Copy',
  className,
}: {
  text: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(id)
  }, [copied])

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
        } catch {
          // Clipboard access can be denied; the text is still on the page to select.
        }
      }}
      aria-label={copied ? 'Copied' : label}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md text-neutral-400 transition-colors hover:text-white',
        className,
      )}
    >
      {copied ? <Check className="h-4 w-4 text-green-300" /> : <Copy className="h-4 w-4" />}
      {copied && <span className="text-xs text-green-300">Copied</span>}
    </button>
  )
}
