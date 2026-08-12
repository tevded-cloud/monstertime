// install.ts: putting the app on somebody's home screen.
//
// This is a PWA and always has been, but nothing ever offered it. The browser
// decides on its own whether to nag, most of them have stopped nagging, and the
// people most likely to want a creature on their home screen are exactly the
// ones who will never find it behind a three-dot menu.
//
// Two paths, because the platforms genuinely differ:
//
//   Chromium fires `beforeinstallprompt`, which can be saved and replayed from
//   a control of our own. index.html catches it, because it fires long before
//   React mounts.
//
//   iOS Safari has no such event and no API. Installing is Share then Add to
//   Home Screen, and the only honest thing an app can do is say so.

import { useEffect, useState } from 'react'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Held = { __mtInstall?: InstallEvent | null }

/** The display modes a launcher uses when the app is not in a browser tab. */
const INSTALLED_MODES = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']

export function alreadyInstalled(): boolean {
  try {
    for (const mode of INSTALLED_MODES) {
      if (matchMedia(`(display-mode: ${mode})`).matches) return true
    }
  } catch {
    // matchMedia with an unknown feature throws in some engines rather than
    // returning a non-matching list. Fall through to the iOS check.
  }
  return (navigator as { standalone?: boolean }).standalone === true
}

/**
 * iOS Safari, where installing exists but cannot be offered, only described.
 *
 * Chrome and Firefox on iOS are Safari underneath and cannot install at all, so
 * they are excluded: telling somebody to use a Share menu that will not do it
 * is worse than saying nothing.
 */
export function needsTheIosRecipe(): boolean {
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
  if (!iOS) return false
  return !/CriOS|FxiOS|EdgiOS/.test(ua)
}

export type InstallState = 'unavailable' | 'ready' | 'ios' | 'installed'

export function useInstall(): { state: InstallState; install: () => void } {
  const [held, setHeld] = useState<InstallEvent | null>(() => (window as Held).__mtInstall ?? null)
  const [installed, setInstalled] = useState(() => alreadyInstalled())

  useEffect(() => {
    const onChange = (): void => {
      setHeld((window as Held).__mtInstall ?? null)
      setInstalled(alreadyInstalled())
    }
    // Fired by the catcher in index.html, for both the offer arriving and it
    // being spent.
    window.addEventListener('mt:installable', onChange)
    return () => window.removeEventListener('mt:installable', onChange)
  }, [])

  const state: InstallState = installed
    ? 'installed'
    : held
      ? 'ready'
      : needsTheIosRecipe()
        ? 'ios'
        : 'unavailable'

  function install(): void {
    const offer = (window as Held).__mtInstall
    if (!offer) return
    void offer.prompt().then(() =>
      offer.userChoice.then((choice) => {
        // Spent either way: the browser will not replay one offer twice, and
        // leaving the control on screen after a refusal is nagging.
        ;(window as Held).__mtInstall = null
        if (choice.outcome === 'accepted') setInstalled(true)
        setHeld(null)
      }),
    )
  }

  return { state, install }
}
