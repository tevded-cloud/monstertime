// What a group can hand a creature.
//
// Five shelves: stones, made things, found things, soft things, and things with
// somebody on them. Giving is the kind that puts objects into a creature's
// world rather than into the creature, so its substance is thin and its craft
// is high: what a thing IS matters more here than what it is made of.
//
// CRAFT IS ON EVERY SHELF. A gift is a puzzle before it is a possession, and
// the second axis is what separates a river stone from a shed skin.
//
// SIX KEYS ARE INHERITED AND MUST NEVER CHANGE: riverStone, crackedBell,
// knottedRope, shedSkin, mirrorBit, mapScrap.

import type { Shelf } from './catalogue'

export const GIVE_SHELVES: Shelf[] = [
  {
    label: 'stones',
    kind: 'give',
    push: { craft: 2, stillness: 3 },
    gives: { mineral: 3 },
    items: [
      { key: 'riverStone', label: 'a river stone', blurb: 'Smooth, cold, and exactly the right weight.' },
      { key: 'mirrorBit', label: 'a bit of mirror', blurb: 'It meets itself. This takes some working out.', tilt: { resonance: 1 } },
      { key: 'flintChip', label: 'a chip of flint', blurb: 'Sharp on one edge. It is careful with it.', tilt: { ferocity: 1 } },
      { key: 'holedStone', label: 'a stone with a hole in it', blurb: 'It looks through. Of course it looks through.' },
      { key: 'quartzLump', label: 'a lump of quartz', blurb: 'It carries this everywhere for a week.', tilt: { bond: 1 } },
      { key: 'seaGlass', label: 'sea glass', blurb: 'Worn soft by something bigger than both of you.', gives: { mineral: 2, brine: 2 } },
      { key: 'oldBrick', label: 'half a brick', blurb: 'You did not expect this to be the favourite.' },
    ],
  },
  {
    label: 'made things',
    kind: 'give',
    push: { craft: 2, resonance: 2 },
    items: [
      { key: 'crackedBell', label: 'a cracked bell', blurb: 'The wrong note, which it prefers.' },
      { key: 'knottedRope', label: 'a knotted rope', blurb: 'It works on the knots. It does not undo them.' },
      { key: 'woodenSpoon', label: 'a wooden spoon', blurb: 'Chewed to a shape only it understands.' },
      { key: 'tinWhistle', label: 'a tin whistle', blurb: 'It cannot play it and this does not stop it.', tilt: { resonance: 1 } },
      { key: 'ballOfWool', label: 'a ball of wool', blurb: 'The room is now a diagram of everywhere it went.' },
      { key: 'brokenClock', label: 'a clock that stopped', blurb: 'The ticking is gone and it still listens for it.', tilt: { stillness: 1 } },
      { key: 'leatherStrap', label: 'an old leather strap', blurb: 'Smells of somebody else. It is fascinated.', tilt: { bond: 1 } },
    ],
  },
  {
    label: 'found things',
    kind: 'give',
    push: { craft: 2, roam: 2, ferocity: 1 },
    gives: { verdure: 1, ember: 1 },
    items: [
      { key: 'shedSkin', label: 'a shed skin', blurb: 'Something else was here and is not now.' },
      { key: 'mapScrap', label: 'a scrap of map', blurb: 'A corner of somewhere neither of you has been.' },
      { key: 'featherLong', label: 'a long feather', blurb: 'It walks around holding it like a flag.' },
      { key: 'emptyShell', label: 'an empty shell', blurb: 'It listens to it, which is not how that works.', gives: { brine: 2 } },
      { key: 'oldNest', label: 'an old nest', blurb: 'Handled like it might still be needed.', tilt: { stillness: 1 } },
      { key: 'antler', label: 'a dropped antler', blurb: 'Heavier than it looks. It manages.', tilt: { ferocity: 1 }, gives: { mineral: 2 } },
      { key: 'pinecone', label: 'a good pinecone', blurb: 'There were forty. This is the good one.' },
    ],
  },
  {
    label: 'soft things',
    kind: 'give',
    // The shelf that is about comfort rather than interest, so it is the one
    // that trades craft away for bond and stillness.
    push: { craft: 1, bond: 2, stillness: 2 },
    items: [
      { key: 'oldBlanket', label: 'the old blanket', blurb: 'It arranges this for a full minute before lying down.' },
      { key: 'yourJumper', label: 'a jumper you have worn', blurb: 'It sleeps on this and not on the good bed.', tilt: { bond: 2 } },
      { key: 'strawBundle', label: 'a bundle of straw', blurb: 'Trampled into a circle. Twice.' },
      { key: 'sheepskin', label: 'a bit of sheepskin', blurb: 'Kneaded, at length, for no reason either of you knows.' },
      { key: 'sackOfChaff', label: 'a sack of chaff', blurb: 'It moves this to where it wanted it.' },
    ],
  },
  {
    label: 'from a person',
    kind: 'give',
    // Things that carry a person on them. The point is whose it was, so hiding
    // one to be hunted is false: the giving is the whole of it.
    push: { craft: 1, bond: 2, resonance: 2 },
    methods: ['give.fuss', 'give.leftOut'],
    items: [
      { key: 'ownGlove', label: 'a glove of yours', blurb: 'It knows exactly whose. It always knows.' },
      { key: 'combedHair', label: 'a knot of your hair', blurb: 'Strange to give. Stranger how much it matters.' },
      { key: 'boughtToken', label: 'something you bought for it', blurb: 'You went out of your way. It can tell that too.', tilt: { bond: 1 } },
      { key: 'sharedCup', label: 'the cup you drink from', blurb: 'Now it is the cup you both drink from.' },
      { key: 'firstThing', label: 'the first thing it ever took', blurb: 'Kept all this time by somebody.', tilt: { stillness: 1 } },
    ],
  },
]
