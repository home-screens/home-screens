'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { LogoMark } from '@/components/LogoMark'
import { HUB_RETURN_PATH, hubReturnOrigin } from '@/lib/hub-return'

/**
 * The page Google returns to after a Google Photos sign-in from Home Screens.
 *
 * Google will not return to a hub's home-network address, so this public
 * page is the return address on Home Screens' own Google app and on every
 * household's own web client. When the sign-in link carries the hub's
 * address and it is on a home network (src/lib/hub-return.ts), the page sends
 * the browser straight back to the hub, which finishes the sign-in itself.
 * Otherwise it shows the code to paste into the editor. The page never talks
 * to any server, and the code works once and expires within minutes.
 */

/** A forward in flight, kept for this tab so Back from a failed forward can show the code. */
const FORWARD_KEY = 'hs-connect-google-forward'
/** How long a saved forward is worth showing: a sign-in code lasts minutes. */
const FORWARD_TTL_MS = 10 * 60_000
/** When "Not moving?" appears under the forwarding message. */
const NOT_MOVING_AFTER_MS = 3000

interface SavedForward {
  code: string | null
  at: number
}

type View =
  | { kind: 'intro' }
  | { kind: 'forwarding'; hubName: string; code: string | null }
  | { kind: 'unreachable'; code: string }
  | { kind: 'code'; code: string }
  | { kind: 'cancelled' }

function saveForward(forward: SavedForward) {
  try {
    sessionStorage.setItem(FORWARD_KEY, JSON.stringify(forward))
  } catch {
    /* storage blocked: Back then shows the intro instead of the code */
  }
}

function savedForward(): SavedForward | null {
  try {
    const raw = sessionStorage.getItem(FORWARD_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as SavedForward
    return Date.now() - saved.at < FORWARD_TTL_MS ? saved : null
  } catch {
    return null
  }
}

/** Arriving here with nothing in the address: back from a forward that failed, or just visiting. */
function viewAfterForward(): View {
  const saved = savedForward()
  if (!saved) return { kind: 'intro' }
  return saved.code ? { kind: 'unreachable', code: saved.code } : { kind: 'cancelled' }
}

export default function ConnectGooglePage() {
  const router = useRouter()
  const [view, setView] = useState<View | null>(null)
  const [notMoving, setNotMoving] = useState(false)
  const [copied, setCopied] = useState(false)

  const started = useRef(false)

  useEffect(() => {
    // Once only: this reads the single-use code and clears it from the
    // address, so a second run would find nothing and forget it.
    if (started.current) return
    started.current = true

    const hadQuery = window.location.search !== ''
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')
    const state = params.get('state')
    // Strip the single-use code from the address bar the moment it's read,
    // so it never lingers in browser history, Referer headers, or anything
    // else that sees the URL later. (The root layout's analytics bootstrap
    // also excludes /connect/* query strings, as a second layer: script
    // ordering vs. this effect isn't guaranteed.) Next's saved state rides
    // along so its router can still restore this entry.
    if (hadQuery) {
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
    // Next's router keeps its own copy of the address and writes it back on
    // its next update, and its hook for the call above only goes in after
    // this first effect. A page that stays tells the router as well; one
    // leaving for the hub must not, since a same-page navigation could
    // cancel the forward.
    const stay = (next: View) => {
      setView(next)
      if (hadQuery) router.replace(window.location.pathname, { scroll: false })
    }

    if (!code && !error) {
      stay(viewAfterForward())
      return
    }

    const hub = hubReturnOrigin(state)
    if (!hub || state === null) {
      stay(code ? { kind: 'code', code } : { kind: 'cancelled' })
      return
    }

    saveForward({ code, at: Date.now() })
    setView({ kind: 'forwarding', hubName: new URL(hub).hostname, code })
    const answer = new URLSearchParams(code ? { code } : { error: error ?? 'access_denied' })
    answer.set('state', state)
    window.location.assign(`${hub}${HUB_RETURN_PATH}?${answer}`)
  }, [router])

  // Back from the hub (or from the browser's error page) can restore this
  // page as it was; say the forward failed instead of "taking you back".
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      setView(viewAfterForward())
      // The router still holds the address it had before the forward.
      router.replace(window.location.pathname, { scroll: false })
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [router])

  const forwarding = view?.kind === 'forwarding'
  useEffect(() => {
    if (!forwarding) return
    const timer = setTimeout(() => setNotMoving(true), NOT_MOVING_AFTER_MS)
    return () => clearTimeout(timer)
  }, [forwarding])

  const showCode = (code: string) => {
    // Stop a forward that is still trying, so it can't take the page away.
    window.stop()
    setView({ kind: 'code', code })
    // Staying after all: the router still holds the address with the code.
    router.replace(window.location.pathname, { scroll: false })
  }

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable: the user can select the code manually */
    }
  }

  const codeBlock = (code: string) => (
    <>
      <div className="mt-5 break-all rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-emerald-400">
        {code}
      </div>
      <button
        onClick={() => copy(code)}
        className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
      >
        {copied ? 'Copied!' : 'Copy code'}
      </button>
    </>
  )

  const heading =
    view === null ? 'Connect Google Photos'
    : view.kind === 'forwarding' ? 'Taking you back to Home Screens…'
    : view.kind === 'unreachable' ? "We couldn't reach your Home Screens"
    : view.kind === 'code' ? 'Almost done!'
    : view.kind === 'cancelled' ? 'Sign-in was cancelled'
    : 'Connect Google Photos'

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <LogoMark className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-wide text-slate-300">
            Home Screens
          </span>
        </div>
        <h1 className="text-xl font-semibold text-white">{heading}</h1>

        {view?.kind === 'forwarding' ? (
          <>
            <div
              aria-hidden="true"
              className="mx-auto mt-5 mb-1 h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400"
            />
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Going to {view.hubName}
            </p>
            {notMoving && view.code && (
              <p className="mt-4 text-xs text-slate-500">
                <button
                  onClick={() => showCode(view.code!)}
                  className="text-sky-400 hover:text-sky-300"
                >
                  Not moving? Show the code instead
                </button>
              </p>
            )}
          </>
        ) : view?.kind === 'unreachable' ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Copy this code and go back to the editor. Click “Didn&apos;t come
              back? Paste a code”, paste it there, then click “Finish
              sign-in”. Check this computer is on the same Wi-Fi as your Home
              Screens.
            </p>
            {codeBlock(view.code)}
          </>
        ) : view?.kind === 'code' ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Copy this code and go back to the editor. If you see
              “Didn&apos;t come back? Paste a code”, click it first. Paste the
              code, then click “Finish sign-in”.
            </p>
            {codeBlock(view.code)}
            <p className="mt-4 text-xs text-slate-500">
              This code works once and expires in a few minutes. You can close
              this tab after pasting it.
            </p>
          </>
        ) : view?.kind === 'cancelled' ? (
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            No problem. Close this tab and start again from the editor whenever
            you like: open Settings &gt; Pictures &amp; videos, click “Add from
            Google Photos”, then “Sign in to add from Google Photos”.
          </p>
        ) : view?.kind === 'intro' ? (
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Google sends you to this page after you sign in to Google Photos
            from Home Screens, and it takes you straight back to your Home
            Screens or gives you a code to paste there. Start the sign-in from
            the editor: open Settings &gt; Pictures &amp; videos, click “Add
            from Google Photos”, then “Sign in to add from Google Photos”.
          </p>
        ) : null}

        {view?.kind !== 'forwarding' && (
          <p className="mt-6 text-xs text-slate-500">
            <Link
              href="/docs/backgrounds#google-photos"
              className="text-sky-400 hover:text-sky-300"
            >
              How the Google Photos import works
            </Link>
            <span className="mx-2 text-slate-700">·</span>
            <Link href="/" className="text-sky-400 hover:text-sky-300">
              homescreens.dev
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}
