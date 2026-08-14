// Said.tsx: what the object said, wherever a person can be told it.
//
// The Durable Object writes seventeen sentences in the app's voice, all of them
// refusals somebody is owed an explanation for: the per person and per group
// hourly caps, three burst limits, the stage gate, waking a creature that is
// already awake, a group that is full, a rename too soon, a pledge from a purse
// that cannot cover it. Every one of them used to reach `console.error` and
// stop there.
//
// Routing them into ActionBar's line fixed that on ONE screen. It is not the
// only screen a person can be refused on, and it is not even the likeliest:
//
//   - The market is a screen of its own. ActionBar is not rendered there at
//     all, so a group choosing an egg together, which is now the first thing
//     anybody does, was still being refused into a console.
//   - The group panel is a modal dialog. It sits in the top layer, over the
//     action bar, so a refused claim or a refused rename wrote a sentence onto
//     a line the person could not see while the panel that caused it was open.
//
// So this is the reader, and it is a component rather than a hook because every
// place that needs it needs the same three things: the live region, the timing,
// and the empty case rendering nothing rather than an empty box.
//
// ActionBar deliberately does NOT use this. It has a second source, its own
// answer for a tap on a kind that is offering nothing, and it has to pick the
// newer of the two and take back a cooldown when the object's arrives. Folding
// that in here would put ActionBar's rules in everybody's way. One store, two
// readers, and the store is the thing they agree through.

import type { JSX } from 'react'
import { useSyncExternalStore } from 'react'
import { readSentence, subscribeSentence } from '../net/connection'

/**
 * The current sentence, for a surface that already owns a line.
 *
 * The market has one: it carries which egg is in front and how far short it is.
 * That is state, and a refusal is an event, and putting them on separate lines
 * would mean two live regions on one screen both announcing. So the market
 * takes the newer of the two on the line it already has, which is the rule
 * ActionBar settled on for the same reason, written down there as: both on
 * screen at once would be the app arguing with itself.
 */
export function useSaid(): { text: string; at: number } | null {
  return useSyncExternalStore(subscribeSentence, readSentence, () => null)
}

interface SaidProps {
  /** Where it is being shown, so a stylesheet can place it without this file
   *  knowing anything about layout. */
  where: string
}

export default function Said({ where }: SaidProps): JSX.Element | null {
  const said = useSaid()
  // Nothing rather than an empty element. A live region that is present and
  // empty is announced by some screen readers as it appears and disappears,
  // and the surfaces this sits on are already busy.
  if (said === null) return null
  return (
    <p className={`said said-${where}`} role="status" aria-live="polite">
      {said.text}
    </p>
  )
}
