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
      { key: 'humDusk', label: 'hum to it at dusk', blurb: 'The same four notes every evening.', past: 'hummed to it', memory: 'humming to it at dusk' },
      { key: 'sayItsName', label: 'say its name, over and over', blurb: 'The word becomes a sound before it becomes a name.', past: 'said its name over and over', memory: 'saying its name over and over' },
      { key: 'readAloud', label: 'read to it badly', blurb: 'It does not care what the book is.', past: 'read to it', memory: 'reading to it' },
      { key: 'tellDay', label: 'tell it about your day', blurb: 'The account gets longer each time.', past: 'told it about the day', memory: 'telling it about the day', tilt: { bond: 1 } },
      { key: 'oldSong', label: 'sing the one you always sing', blurb: 'The pauses stay the same, even when the rest does not.', past: 'sang it the old song', memory: 'singing it the old song' },
      { key: 'nonsense', label: 'talk absolute nonsense at it', blurb: 'Tone is everything. Words are nothing.', past: 'talked absolute nonsense at it', memory: 'talking absolute nonsense at it' },
      { key: 'lullaby', label: 'sing it down to sleep', blurb: 'Slower each verse, until neither of you is quite awake.', past: 'sang it down to sleep', memory: 'singing it down to sleep', methods: ['sing.close', 'sing.underBreath'], tilt: { stillness: 2 } },
    ],
  },
  {
    label: 'rhythm',
    kind: 'sing',
    push: { resonance: 3, vigor: 2 },
    // These sounds may be near or across the room. None can be made under
    // somebody's breath, which is a manner of speaking rather than distance.
    methods: ['sing.close', 'sing.across'],
    items: [
      { key: 'clapRhythm', label: 'clap a rhythm', blurb: 'The room keeps the beat after your hands stop.', past: 'clapped a rhythm at it', memory: 'clapping rhythms at it' },
      { key: 'drumFloor', label: 'drum on the floor', blurb: 'It feels this more than it hears it.', past: 'drummed on the floor for it', memory: 'drumming on the floor for it' },
      { key: 'tapTheBowl', label: 'tap on its bowl', blurb: 'Unfair, and it works every time.', past: 'tapped a rhythm on its bowl', memory: 'tapping rhythms on its bowl', minStage: 1, tilt: { nourish: 1 } },
      { key: 'stampAlong', label: 'stamp until it stamps', blurb: 'The floor complains. Neither of you stops.', past: 'stamped until it stamped too', memory: 'stamping until it joined in', minStage: 1 },
      { key: 'twoSticks', label: 'knock two sticks together', blurb: 'A plain noise, hard to stop making.', past: 'knocked two sticks together for it', memory: 'knocking two sticks together for it', tilt: { craft: 1 } },
      { key: 'stringPluck', label: 'pluck one string, badly', blurb: 'The note bends, badly, and holds.', past: 'plucked one string for it', memory: 'plucking one string for it' },
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
      { key: 'whistleFar', label: 'whistle from across the field', blurb: 'It comes at a flat run, every time.', past: 'whistled for it', memory: 'whistling for it from across the field', minStage: 1 },
      { key: 'callFromDoor', label: 'call it from the door', blurb: 'You hear it hit the stairs before you see it.', past: 'called for it', memory: 'calling it from the door', minStage: 1 },
      { key: 'shoutOverWater', label: 'shout across the water', blurb: 'The far bank says it back to both of you.', past: 'shouted to it', memory: 'shouting to it across the water' },
      { key: 'ringTheBell', label: 'ring the bell for it', blurb: 'One clear note, then the metal shaking after it.', past: 'rang the bell for it', memory: 'ringing the bell for it', tilt: { craft: 1 } },
      { key: 'twoNoteCall', label: 'the two-note call', blurb: 'Yours alone. It never answers a stranger doing it.', past: 'made the two-note call for it', memory: 'giving it the two-note call', minStage: 1, tilt: { bond: 2 } },
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
      { key: 'breathOnly', label: 'just breathe with it', blurb: 'You match it. Then it matches you.', past: 'breathed in time with it', memory: 'breathing in time with it', minStage: 1, methods: ['sing.close'], tilt: { bond: 1 } },
      { key: 'shush', label: 'shush it, softly', blurb: 'Not a word. It settles anyway.', past: 'shushed it softly', memory: 'shushing it softly' },
      { key: 'clickTongue', label: 'click your tongue at it', blurb: 'The smallest sound in the house.', past: 'made the smallest click at it', memory: 'making small clicks at it', methods: ['sing.close'] },
      { key: 'nameOnce', label: 'say its name once, quietly', blurb: 'Only the ear moves.', past: 'said its name once', memory: 'saying its name quietly', minStage: 1 },
      { key: 'humToYourself', label: 'hum to yourself, not to it', blurb: 'It comes over to be near the sound.', past: 'hummed to nobody in particular', memory: 'humming until it came closer', minStage: 1, tilt: { bond: 1 } },
    ],
  },
  {
    label: 'words with a shape',
    kind: 'sing',
    // Language used as pattern rather than meaning. Craft, because the creature
    // is learning that some sounds are the same sound twice.
    push: { resonance: 3, craft: 2 },
    items: [
      { key: 'countAloud', label: 'count to ten at it', blurb: 'It waits for the end. It knows there is an end.', past: 'counted to ten at it', memory: 'counting to ten at it' },
      { key: 'listThings', label: 'name everything in the room', blurb: 'It looks at each one as you get to it.', past: 'named everything in the room for it', memory: 'naming everything in the room for it', minStage: 1 },
      { key: 'rhymeIt', label: 'make a rhyme out of its name', blurb: 'Terrible. Better on the third attempt.', past: 'made a rhyme out of its name', memory: 'making rhymes out of its name' },
      { key: 'repeatBack', label: 'copy the noise it just made', blurb: 'It stops. It does it again. Something has happened.', past: 'copied the noise it made', memory: 'copying the noises it made', minStage: 1, tilt: { bond: 2 } },
      { key: 'askQuestions', label: 'ask it things', blurb: 'You both know it is not going to answer.', past: 'asked it things anyway', memory: 'asking it things anyway' },
      { key: 'sameStory', label: 'tell it the same story again', blurb: 'The fourth time is when the ending starts arriving early.', past: 'told it the same story again', memory: 'telling it the same story again', tilt: { stillness: 1 } },
    ],
  },
]
