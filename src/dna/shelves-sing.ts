// What a group can say to a creature, or make a noise at it with.
//
// Five shelves: the voice, rhythm, from far off, quiet, and words with a shape
// to them. This kind puts nothing into a creature at all, which is the point of
// the substance channel being separate: singing to a thing changes what it is
// like without changing what it is made of.
//
// RESONANCE IS ON EVERY SHELF. The second axis is what separates humming at
// dusk from drumming on the floor.
//
// THE MANNERS HERE ARE ABOUT DISTANCE, which is why more items narrow them than
// on any other kind. "whistle from across the field" cannot be done up close;
// that pairing is what prompted the whole per-item allow-list, and everything
// on the "from far off" shelf has the same problem.
//
// SIX KEYS ARE INHERITED AND MUST NEVER CHANGE: humDusk, clapRhythm, sayItsName,
// whistleFar, drumFloor, readAloud.

import type { Shelf } from './catalogue'

export const SING_SHELVES: Shelf[] = [
  {
    label: 'voice',
    kind: 'sing',
    push: { resonance: 3, bond: 2 },
    items: [
      { key: 'humDusk', label: 'hum to it at dusk', blurb: 'The same four notes every evening.' },
      { key: 'sayItsName', label: 'say its name, over and over', blurb: 'Its ears do the same thing every time.' },
      { key: 'readAloud', label: 'read to it badly', blurb: 'It does not care what the book is.' },
      { key: 'tellDay', label: 'tell it about your day', blurb: 'It listens the way nobody else does.', tilt: { bond: 1 } },
      { key: 'oldSong', label: 'sing the one you always sing', blurb: 'It knows where the pauses are.' },
      { key: 'nonsense', label: 'talk absolute nonsense at it', blurb: 'Tone is everything. Words are nothing.' },
      { key: 'lullaby', label: 'sing it down to sleep', blurb: 'Slower each verse, until neither of you is quite awake.', tilt: { stillness: 2 } },
    ],
  },
  {
    label: 'rhythm',
    kind: 'sing',
    push: { resonance: 3, vigor: 2 },
    items: [
      { key: 'clapRhythm', label: 'clap a rhythm', blurb: 'It joins in wrong, with confidence.' },
      { key: 'drumFloor', label: 'drum on the floor', blurb: 'It feels this more than it hears it.' },
      { key: 'tapTheBowl', label: 'tap on its bowl', blurb: 'Unfair, and it works every time.', tilt: { nourish: 1 } },
      { key: 'stampAlong', label: 'stamp until it stamps', blurb: 'The floor complains. Neither of you stops.' },
      { key: 'twoSticks', label: 'knock two sticks together', blurb: 'It tries to take the sticks. That is also a rhythm.', tilt: { craft: 1 } },
      { key: 'stringPluck', label: 'pluck one string, badly', blurb: 'The note bends. So does its head.' },
    ],
  },
  {
    label: 'from far off',
    kind: 'sing',
    // Distance is the shelf. Every manner about being near it is false here,
    // and this is the shelf that the whole per-item allow-list came from.
    push: { resonance: 3, roam: 2 },
    methods: ['sing.across'],
    items: [
      { key: 'whistleFar', label: 'whistle from across the field', blurb: 'It comes at a flat run, every time.' },
      { key: 'callFromDoor', label: 'call it from the door', blurb: 'You hear it hit the stairs before you see it.' },
      { key: 'shoutOverWater', label: 'shout across the water', blurb: 'The far bank says it back to both of you.' },
      { key: 'ringTheBell', label: 'ring the bell for it', blurb: 'It has decided the bell means something good.', tilt: { craft: 1 } },
      { key: 'twoNoteCall', label: 'the two-note call', blurb: 'Yours alone. It never answers a stranger doing it.', tilt: { bond: 2 } },
    ],
  },
  {
    label: 'quiet',
    kind: 'sing',
    // Sound at its smallest. The one shelf where being close is the whole
    // point, so it refuses the manner about being across the room.
    push: { resonance: 2, stillness: 3 },
    methods: ['sing.close', 'sing.underBreath'],
    items: [
      { key: 'breathOnly', label: 'just breathe with it', blurb: 'You match it. Then it matches you.', tilt: { bond: 1 } },
      { key: 'shush', label: 'shush it, softly', blurb: 'Not a word. It settles anyway.' },
      { key: 'clickTongue', label: 'click your tongue at it', blurb: 'The smallest sound in the house.' },
      { key: 'nameOnce', label: 'say its name once, quietly', blurb: 'Only the ear moves.' },
      { key: 'humToYourself', label: 'hum to yourself, not to it', blurb: 'It comes over to be near the sound.', tilt: { bond: 1 } },
    ],
  },
  {
    label: 'words with a shape',
    kind: 'sing',
    // Language used as pattern rather than meaning. Craft, because the creature
    // is learning that some sounds are the same sound twice.
    push: { resonance: 3, craft: 2 },
    items: [
      { key: 'countAloud', label: 'count to ten at it', blurb: 'It waits for the end. It knows there is an end.' },
      { key: 'listThings', label: 'name everything in the room', blurb: 'It looks at each one as you get to it.' },
      { key: 'rhymeIt', label: 'make a rhyme out of its name', blurb: 'Terrible. It is delighted.' },
      { key: 'repeatBack', label: 'copy the noise it just made', blurb: 'It stops. It does it again. Something has happened.', tilt: { bond: 2 } },
      { key: 'askQuestions', label: 'ask it things', blurb: 'You both know it is not going to answer.' },
      { key: 'sameStory', label: 'tell it the same story again', blurb: 'The fourth time is when it starts settling early.', tilt: { stillness: 1 } },
    ],
  },
]
