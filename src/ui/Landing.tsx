// Landing.tsx: the front door, and the door people arrive at from a link.
//
// There is no account here on purpose. The only thing the app needs from a
// person is something to call them in the chronicle, because a trait credited
// to "guest-4f2a" is worth nothing to read back in a year.

import { useState } from 'react'
import type { JSX } from 'react'
import { createGroup } from '../net'
import { commitLocalName, groupIdFromText, setGroupHash } from './useGroup'

const NAME_MAX = 24

interface LandingProps {
  mode: 'new' | 'join'
}

export default function Landing({ mode }: LandingProps): JSX.Element {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [link, setLink] = useState('')

  const clean = name.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX)
  const ready = clean.length > 0

  async function start(): Promise<void> {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      commitLocalName(clean)
      const id = await createGroup()
      setGroupHash(id)
    } catch {
      setError('That did not take. Try once more.')
      setBusy(false)
    }
  }

  function join(): void {
    if (!ready) return
    if (mode === 'join') {
      commitLocalName(clean)
      return
    }
    const id = groupIdFromText(link)
    if (!id) {
      setError('That link does not look like a creature. Paste the whole thing.')
      return
    }
    commitLocalName(clean)
    setGroupHash(id)
  }

  const invited = mode === 'join'

  return (
    <div className="landing">
      <div>
        <div className="mark">
          <Sigil />
          <span>MonsterTime</span>
        </div>

        <h1>{invited ? 'Somebody wants you in on this.' : 'Something is going to hatch.'}</h1>

        <p className="premise">
          {invited
            ? 'Your friends are raising one creature between them, and it grows into whatever their habits make it. Tell it what to call you and it will start counting you in.'
            : 'You and your friends raise one creature between you. What you feed it, where you take it and how you treat it decide what it grows into, so no two groups end up with the same animal.'}
        </p>

        <div className="field">
          <label className="label" htmlFor="first-name">
            First name
          </label>
          <input
            id="first-name"
            className="text-input"
            type="text"
            autoComplete="given-name"
            spellCheck={false}
            maxLength={NAME_MAX}
            placeholder="What should it call you"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              if (invited) join()
              else void start()
            }}
          />
          <p className="hint">Stored on this device only. Nothing else is asked for.</p>
        </div>

        {invited ? (
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={!ready} onClick={join}>
              Go and meet it
            </button>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={() => void start()}>
              {busy ? 'Laying an egg' : 'Start a creature'}
            </button>
            {!ready && <span className="hint">A name first, then the egg.</span>}
          </div>
        )}

        {error && <p className="hint hint-bad">{error}</p>}

        {!invited && (
          <div className="door">
            {joining ? (
              <>
                <p>Paste the link a friend sent you.</p>
                <div className="link-row">
                  <input
                    className="text-input"
                    type="text"
                    inputMode="url"
                    spellCheck={false}
                    placeholder="https://..."
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') join()
                    }}
                  />
                </div>
                <div className="row">
                  <button type="button" className="btn btn-line" disabled={!ready || !link.trim()} onClick={join}>
                    Join them
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>Already got a link from somebody?</p>
                <button type="button" className="btn-text" onClick={() => setJoining(true)}>
                  Join a creature that already exists
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="plate">
        <Plate />
      </div>
    </div>
  )
}

// The wordmark sits next to a drawn egg rather than an icon font or an emoji,
// so the identity survives being screenshotted into a group chat.
export function Sigil(): JSX.Element {
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" fill="none" aria-hidden="true">
      <path
        d="M8 1.4c3.4 0 6.2 5 6.2 9.4 0 4.1-2.7 7.2-6.2 7.2S1.8 14.9 1.8 10.8C1.8 6.4 4.6 1.4 8 1.4Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M8 8.6v3.2" stroke="var(--ember)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// A specimen plate: the egg, contour lines the way a field guide draws one, and
// a single ember mark where it is going to give.
function Plate(): JSX.Element {
  return (
    <svg viewBox="0 0 220 280" fill="none" aria-hidden="true">
      <path
        d="M110 16c46 0 74 62 74 116 0 74-33 132-74 132s-74-58-74-132C36 78 64 16 110 16Z"
        stroke="var(--line)"
        strokeWidth="1.25"
      />
      <path d="M46 128c40 14 88 14 128 0" stroke="var(--line-soft)" strokeWidth="1" />
      <path d="M38 172c46 16 98 16 144 0" stroke="var(--line-soft)" strokeWidth="1" />
      <path d="M44 214c42 14 90 14 132 0" stroke="var(--line-soft)" strokeWidth="1" />
      <path d="M110 16v248" stroke="var(--line-soft)" strokeWidth="1" strokeDasharray="3 7" />
      <path d="M96 96l14 16 12-22 8 14" stroke="var(--ember)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="110" cy="150" r="2.5" fill="var(--ember)" />
    </svg>
  )
}
