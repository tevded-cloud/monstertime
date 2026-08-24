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
    minStage: 1,
    items: [
      // These three are true of an egg when they are left beside it. Hiding a
      // thing so the creature hunts is not, so their manners deliberately omit
      // `give.hidden` rather than pretending an egg can find anything.
      { key: 'riverStone', label: 'a river stone', blurb: 'Smooth, cold, and exactly the right weight.', past: 'brought it a river stone', memory: 'bringing it river stones', minStage: 0, methods: ['give.leftOut', 'give.fuss'] },
      { key: 'mirrorBit', label: 'a bit of mirror', blurb: 'It meets itself. This takes some working out.', past: 'saved it a bit of mirror', memory: 'leaving bits of mirror with it', tilt: { resonance: 1 } },
      { key: 'flintChip', label: 'a chip of flint', blurb: 'Sharp on one edge. It is careful with it.', past: 'picked out a chip of flint for it', memory: 'giving it chips of flint', tilt: { ferocity: 1 } },
      { key: 'holedStone', label: 'a stone with a hole in it', blurb: 'It looks through. Of course it looks through.', past: 'found it a stone with a hole', memory: 'finding it stones with holes' },
      { key: 'quartzLump', label: 'a lump of quartz', blurb: 'It carries this everywhere for a week.', past: 'picked out a lump of quartz for it', memory: 'putting lumps of quartz in with it', tilt: { bond: 1 } },
      { key: 'seaGlass', label: 'sea glass', blurb: 'Worn soft by something bigger than both of you.', past: 'brought it sea glass', memory: 'bringing it sea glass', minStage: 0, methods: ['give.leftOut', 'give.fuss'], gives: { mineral: 2, brine: 2 } },
      { key: 'oldBrick', label: 'half a brick', blurb: 'You did not expect this to be the favourite.', past: 'set aside half a brick for it', memory: 'letting it keep bits of old brick' },
    ],
  },
  {
    label: 'made things',
    kind: 'give',
    push: { craft: 2, resonance: 2 },
    minStage: 1,
    items: [
      { key: 'crackedBell', label: 'a cracked bell', blurb: 'The wrong note, which it prefers.', past: 'chose a cracked bell for it', memory: 'leaving cracked bells with it' },
      { key: 'knottedRope', label: 'a knotted rope', blurb: 'It works on the knots. It does not undo them.', past: 'knotted a rope for it', memory: 'giving it knotted rope' },
      { key: 'woodenSpoon', label: 'a wooden spoon', blurb: 'Chewed to a shape only it understands.', past: 'set aside a wooden spoon for it', memory: 'passing it wooden spoons' },
      { key: 'tinWhistle', label: 'a tin whistle', blurb: 'It cannot play it and this does not stop it.', past: 'found it a tin whistle', memory: 'trusting it with tin whistles', tilt: { resonance: 1 } },
      { key: 'ballOfWool', label: 'a ball of wool', blurb: 'The room is now a diagram of everywhere it went.', past: 'set aside a ball of wool for it', memory: 'putting down balls of wool for it' },
      { key: 'brokenClock', label: 'a clock that stopped', blurb: 'The ticking is gone and it still listens for it.', past: 'brought it a clock that had stopped', memory: 'bringing it stopped clocks', tilt: { stillness: 1 } },
      { key: 'leatherStrap', label: 'an old leather strap', blurb: 'Smells of somebody else. It is fascinated.', past: 'gave it an old leather strap', memory: 'giving it old leather straps', tilt: { bond: 1 } },
    ],
  },
  {
    label: 'found things',
    kind: 'give',
    push: { craft: 2, roam: 2, ferocity: 1 },
    gives: { verdure: 1, ember: 1 },
    minStage: 1,
    items: [
      { key: 'shedSkin', label: 'a shed skin', blurb: 'Something else was here and is not now.', past: 'brought it a shed skin', memory: 'collecting shed skins for it' },
      { key: 'mapScrap', label: 'a scrap of map', blurb: 'A corner of somewhere neither of you has been.', past: 'slipped it a scrap of a map', memory: 'slipping it scraps of maps', minStage: 0, methods: ['give.leftOut', 'give.fuss'] },
      { key: 'featherLong', label: 'a long feather', blurb: 'It walks around holding it like a flag.', past: 'found it a long feather', memory: 'finding it long feathers' },
      { key: 'emptyShell', label: 'an empty shell', blurb: 'It listens to it, which is not how that works.', past: 'gave it an empty shell', memory: 'giving it empty shells', gives: { brine: 2 } },
      { key: 'oldNest', label: 'an old nest', blurb: 'Handled like it might still be needed.', past: 'carried an old nest back for it', memory: 'carrying old nests back for it', tilt: { stillness: 1 } },
      { key: 'antler', label: 'a dropped antler', blurb: 'Heavier than it looks. It manages.', past: 'dragged a dropped antler home for it', memory: 'dragging dropped antlers home for it', tilt: { ferocity: 1 }, gives: { mineral: 2 } },
      { key: 'pinecone', label: 'a good pinecone', blurb: 'There were forty. This is the good one.', past: 'chose it a good pinecone', memory: 'choosing it good pinecones' },
    ],
  },
  {
    label: 'soft things',
    kind: 'give',
    // The shelf that is about comfort rather than interest, so it is the one
    // that trades craft away for bond and stillness.
    push: { craft: 1, bond: 2, stillness: 2 },
    minStage: 1,
    items: [
      { key: 'oldBlanket', label: 'the old blanket', blurb: 'It arranges this for a full minute before lying down.', past: 'brought out the old blanket for it', memory: 'giving it the old blanket' },
      { key: 'yourJumper', label: 'a jumper you have worn', blurb: 'It sleeps on this and not on the good bed.', past: 'put aside a worn jumper for it', memory: 'leaving worn jumpers for it', tilt: { bond: 2 } },
      { key: 'strawBundle', label: 'a bundle of straw', blurb: 'Trampled into a circle. Twice.', past: 'brought it a bundle of straw', memory: 'bringing it bundles of straw' },
      { key: 'sheepskin', label: 'a bit of sheepskin', blurb: 'Kneaded, at length, for no reason either of you knows.', past: 'found it a bit of sheepskin', memory: 'finding it bits of sheepskin' },
      { key: 'sackOfChaff', label: 'a sack of chaff', blurb: 'It moves this to where it wanted it.', past: 'filled a sack with chaff for it', memory: 'putting sacks of chaff in with it' },
    ],
  },
  {
    label: 'from a person',
    kind: 'give',
    // Things that carry a person on them. The point is whose it was, so hiding
    // one to be hunted is false: the giving is the whole of it.
    push: { craft: 1, bond: 2, resonance: 2 },
    methods: ['give.fuss', 'give.leftOut'],
    minStage: 1,
    items: [
      { key: 'ownGlove', label: 'a glove of yours', blurb: 'It knows exactly whose. It always knows.', past: 'kept a familiar glove for it', memory: 'leaving familiar gloves with it' },
      { key: 'combedHair', label: 'a knot of your hair', blurb: 'Strange to give. Stranger how much it matters.', past: 'saved a knot of hair for it', memory: 'giving it knots of hair' },
      { key: 'boughtToken', label: 'something you bought for it', blurb: 'You went out of your way. It can tell that too.', past: 'brought home something bought for it', memory: 'bringing home things bought for it', tilt: { bond: 1 } },
      { key: 'sharedCup', label: 'the cup you drink from', blurb: 'Now it is the cup you both drink from.', past: 'offered it the drinking cup', memory: 'sharing a drinking cup with it' },
      { key: 'firstThing', label: 'the first thing it ever took', blurb: 'Kept all this time by somebody.', past: 'brought back the first thing it ever took', memory: 'giving back the first thing it ever took', tilt: { stillness: 1 } },
    ],
  },
]
