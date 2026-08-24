// CodeRow.tsx: the box a passcode is typed into, and the answers it gives back.
//
// IN A FILE OF ITS OWN BECAUSE IT IS NEEDED ON TWO SCREENS THAT NEVER RENDER
// TOGETHER, and because it only ever had one of them. App.tsx returns <Market>
// outright while a group is still choosing its egg, so <Crowd> does not render
// there at all, and this field lived inside <Crowd>: the one situation it was
// built for was the one situation it could not be reached in. Somebody opens
// the group on a second phone, cannot get at the purse their claim is attached
// to, and the only thing the market offered them was "Claim my place", which
// mints a SECOND member with a purse of its own and pushes the price of the two
// scaling eggs up for everybody in the group, for good.
//
// ONE OF THESE AND NOT TWO. A field that answers a code with the wrong sentence
// is somebody concluding they have lost their place, which is worse than either
// of the things that actually go wrong here, so it is not an object this repo
// gets to keep two copies of. Crowd.tsx and Market.tsx both render this component
// and neither carries its own reader, answer table or input.

import { useRef, useState } from 'react'
import type { JSX } from 'react'
// The one place '@' means "the far end issued this id", imported rather than
// tested again here for the reason net/connection.ts imports it: a second copy
// of that character is a rule that agrees with the first until one is edited.
import { isClaimedMember } from '../market/rules'
import { enterPasscode } from './useGroup'
import type { EnteredCode } from './useGroup'

/**
 * What a code that did not work is told to the person who typed it.
 *
 * THREE ANSWERS AND NEVER A SILENCE. Somebody typing the only copy of a code
 * and seeing nothing happen will conclude they have lost their place, which is
 * worse than either of the two things that actually went wrong.
 *
 * Keyed off the union rather than written as a chain ending in an else, so a
 * fourth way for this to go wrong cannot quietly inherit the sentence about a
 * third: the compiler asks for the missing line the moment the union grows.
 * "Does not open anything here" is the far end's own wording and is deliberately
 * the same answer for a code that is unknown, one that belongs to another group
 * and one that is simply wrong, because telling somebody which of those it was
 * tells them how far through the wordlist they have got.
 */
const CODE_TROUBLE: Record<Exclude<EnteredCode, 'accepted'>, string> = {
  misshapen: 'A code is two words and a number, joined by hyphens, like amber-heron-204.',
  refused: 'That code does not open anything here. Check it against the picture you saved.',
  unanswered: 'Nothing came back just now. Try once more.',
}

/**
 * Somewhere to type the code, which is the half of it that was missing.
 *
 * The card somebody saves says, in as many words, "type this to be yourself
 * again on any phone". The server has understood a code on a hello the whole
 * time; what did not exist anywhere in the app was a box to put one in, so a
 * code only ever worked on the browser it was minted in, which is the one
 * browser that never needs it.
 *
 * BEHIND A TAP, not because it is secondary but because it is a different
 * question to the one beside it. Somebody arriving for the first time is
 * deciding whether to take a place; somebody with a code has already decided and
 * is looking for the way back in. Two boxes asking at once is how the first
 * person ends up reading about a code they have never been given.
 *
 * WHAT IT SAYS WHEN IT WORKS IS NOT OPTIONAL. This panel's own success makes the
 * claim panel beside it disappear, so without a word here the whole answer to
 * somebody typing their only copy of a code would be one box quietly going away.
 *
 * THE SEAT IS THE ONLY INPUT, and it is deliberately not "does this browser hold
 * a code". The two came apart the day the typed path landed: judgeCode in
 * net/connection.ts accepts a code and adopts NO id when it cannot tell which of
 * the people in the room this browser has become, which is a real state where a
 * code is held and the screen still cannot name the person holding it. Asked the
 * storage question, this would hide itself from exactly that person and leave
 * them nothing at all; asked the seat question, it is still there, and typing
 * the code again is the one lever they have.
 */
export default function CodeRow({ actorId }: { actorId: string }): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [back, setBack] = useState(false)
  // The same guard in a ref as well as in state, for the reason the market's
  // slider keeps one: what a handler reads from state is whatever its closure
  // captured, which is a render behind exactly when two events land in one task.
  // Enter leant on is two sends, and only the first is answered: the second is
  // turned away for being a second, and would paint "nothing came back" over a
  // code that had just worked.
  const sending = useRef(false)

  // Whether the far end's answer could be matched to one of the people in the
  // room. Asked of the seat this screen was handed rather than remembered from
  // the moment the code was accepted, so the panel corrects itself if the id
  // lands a beat later instead of standing there being wrong.
  const seated = isClaimedMember(actorId)

  async function send(): Promise<void> {
    if (sending.current || typed.trim() === '') return
    sending.current = true
    setBusy(true)
    setProblem(null)
    const answer = await enterPasscode(typed)
    sending.current = false
    setBusy(false)
    if (answer === 'accepted') {
      setBack(true)
      return
    }
    setProblem(CODE_TROUBLE[answer])
  }

  if (back) {
    // TWO TRUE SENTENCES AND NOT ONE, because 'accepted' covers two outcomes
    // that look nothing alike to the person reading them. The far end never says
    // which member a code resolved to (judgeCode's own comment says one line in
    // the worker would delete it), so a code can be taken while this browser is
    // still sitting under the id it made up for itself. Saying "that is you
    // again" there would be a panel claiming the coins are back on a screen that
    // is still showing none of them.
    return seated ? (
      <div className="claim">
        <span className="label">That is you again</span>
        <p>
          This browser is the person that code belongs to now, so what you do here counts as yours.
          The code is kept on this phone as well, and you will not be asked for it again.
        </p>
      </div>
    ) : (
      <div className="claim">
        <span className="label">That code took</span>
        <p>
          The group has you back, and the code is kept on this phone so you will not be asked for it
          again. What this phone cannot tell yet is which of the people here you are, so it is still
          showing you as a guest.
        </p>
      </div>
    )
  }

  // Nothing to offer somebody who already has their place on this browser.
  if (seated) return null

  if (!open) {
    return (
      <button type="button" className="btn-text code-back" onClick={() => setOpen(true)}>
        I already have a code
      </button>
    )
  }

  return (
    <div className="claim">
      <span className="label">Been here before</span>
      <p>
        If you took a place on another phone, the code you were given puts you back into it. This is
        not a second place: this browser becomes the person that code belongs to.
      </p>
      <label className="label" htmlFor="passcode">
        Your code
      </label>
      <div className="link-row">
        <input
          id="passcode"
          className="text-input"
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          // The same bound the reader itself keeps, rather than a second one:
          // anything longer than this is refused there, and a field that cut at
          // some tidier number would be a rule that disagrees with it.
          maxLength={64}
          placeholder="amber-heron-204"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send()
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={typed.trim() === '' || busy}
          onClick={() => void send()}
        >
          {busy ? 'Checking' : 'Use it'}
        </button>
      </div>
      {/* role="alert" on the sentence and nothing else, which is the rule the
          market's own question panel writes down: a live region is for the
          words. Without it the whole answer to a refused code, for somebody not
          looking at the screen, is a button going from "Checking" back to "Use
          it", and this is the one field in the app where hearing nothing is read
          as having lost your place rather than as having mistyped. */}
      {problem && (
        <p className="hint hint-bad" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
