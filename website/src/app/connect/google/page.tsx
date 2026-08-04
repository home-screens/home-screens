'use client'

import { useEffect, useState } from 'react'

/**
 * OAuth redirect helper for the Google Photos import in Home Screens.
 *
 * Google will not redirect to a hub's LAN address, so every user registers
 * this public page as the redirect URI on their own OAuth web client. The
 * page never talks to any server — it just shows the ?code from the URL so
 * the user can paste it back into their editor. The code is useless without
 * the client secret, which only their own hub has, and it expires within
 * minutes.
 */
export default function ConnectGooglePage() {
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setCode(params.get('code'))
    setError(params.get('error'))
    // Strip the single-use code from the address bar the moment it's read,
    // so it never lingers in browser history, Referer headers, or anything
    // else that sees the URL later. (The root layout's analytics bootstrap
    // also excludes /connect/* query strings, as a second layer — script
    // ordering vs. this effect isn't guaranteed.)
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — the user can select the code manually */
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="text-xl font-semibold text-white">
          {code ? 'Almost done!' : error ? 'Sign-in was cancelled' : 'Connect Google Photos'}
        </h1>

        {code ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Copy this code, then paste it into the Google Photos import box in
              your Home Screens editor.
            </p>
            <div className="mt-5 break-all rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-emerald-400">
              {code}
            </div>
            <button
              onClick={copy}
              className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              {copied ? 'Copied!' : 'Copy code'}
            </button>
            <p className="mt-4 text-xs text-slate-500">
              This code only works with your own Home Screens hub and expires in
              a few minutes. You can close this tab after pasting it.
            </p>
          </>
        ) : error ? (
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            No problem — you can close this tab and try again from your Home
            Screens editor whenever you like.
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            This page is part of the Google Photos sign-in for Home Screens.
            Start the sign-in from the photo settings in your Home Screens
            editor and you&apos;ll land back here with a code to copy.
          </p>
        )}
      </div>
    </main>
  )
}
