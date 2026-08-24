// What a group can work a creature at.
//
// Five shelves. Running is wind, strength is load, discipline is holding a
// thing against wanting not to, water is the one that is play as much as work,
// and skill is the shelf where the creature has to think.
//
// VIGOR IS THE SPINE OF THIS KIND, present on every shelf, for the same reason
// nourish is on every feed shelf: what separates hauling from waiting is the
// SECOND axis, not how much work it was. A shelf that trained the creature
// harder would make itself the correct answer.
//
// SIX KEYS ARE INHERITED AND MUST NEVER CHANGE: chaseYard, liftStones,
// sparPadded, holdStill, climbRope, standGround.

import type { Shelf } from './catalogue'

export const TRAIN_SHELVES: Shelf[] = [
  {
    label: 'running',
    kind: 'train',
    push: { vigor: 3, roam: 2 },
    minStage: 1,
    items: [
      { key: 'chaseYard', label: 'chase it round the yard', blurb: 'Both of you are out of breath.', past: 'chased it round the yard', memory: 'chasing it round the yard' },
      { key: 'climbRope', label: 'send it up the rope', blurb: 'Down is the part it has not worked out.', past: 'sent it up the rope', memory: 'sending it up the rope' },
      { key: 'longWalk', label: 'walk it until it stops pulling', blurb: 'Three miles before it settles.', past: 'walked it until it stopped pulling', memory: 'walking it until it stopped pulling', methods: ['train.hard', 'train.patiently'], tilt: { stillness: 1 } },
      { key: 'fetchUphill', label: 'throw it uphill', blurb: 'It never once questions the arrangement.', past: 'threw things uphill for it', memory: 'throwing things uphill for it' },
      { key: 'weavePosts', label: 'weave it through the posts', blurb: 'It clips the last one every time.', past: 'guided it through the posts', memory: 'guiding it through the posts', tilt: { craft: 1 } },
      { key: 'chaseTheLine', label: 'run it on a long line', blurb: 'Wide circles, until the circles get slow.', past: 'ran it in circles on the long line', memory: 'running it in circles on the long line' },
      { key: 'stairs', label: 'up and down the steps', blurb: 'It counts. You are fairly sure it counts.', past: 'took it up and down the steps', memory: 'taking it up and down the steps' },
      { key: 'sprintStop', label: 'flat out, then stop dead', blurb: 'The stopping is the hard half.', past: 'made it stop from a flat-out run', memory: 'making it stop from flat-out runs', tilt: { stillness: 1 } },
    ],
  },
  {
    label: 'strength',
    kind: 'train',
    push: { vigor: 3, ferocity: 3 },
    minStage: 1,
    items: [
      { key: 'liftStones', label: 'lift stones with it', blurb: 'It takes the biggest one first, badly.', past: 'got it lifting stones', memory: 'getting it to lift stones' },
      { key: 'sparPadded', label: 'spar with a padded arm', blurb: 'It has learned to hold back. Mostly.', past: 'sparred with it', memory: 'sparring with it' },
      { key: 'dragLog', label: 'drag a log between you', blurb: 'It leans into the harness like it was born there.', past: 'dragged a log with it', memory: 'dragging logs with it' },
      { key: 'tugRope', label: 'tug on a knotted rope', blurb: 'You let go first. You always let go first.', past: 'played tug with it', memory: 'playing tug with it' },
      { key: 'pushTheGate', label: 'lean it against the gate', blurb: 'The gate has opinions. It loses.', past: 'braced it against the gate', memory: 'bracing it against the gate' },
      { key: 'carryLoad', label: 'load it up and walk', blurb: 'Proud of the weight in a way that is hard to watch.', past: 'loaded it up for a walk', memory: 'loading it up for walks', tilt: { bond: 1 } },
      { key: 'digOut', label: 'set it digging', blurb: 'The hole is not where you asked for the hole.', past: 'set it digging', memory: 'setting it digging', tilt: { craft: 1 } },
    ],
  },
  {
    label: 'discipline',
    kind: 'train',
    // The one shelf where the work is holding still, so it is the one that
    // takes stillness instead of giving it away.
    push: { vigor: 2, stillness: 3 },
    minStage: 1,
    items: [
      // Holding still cannot be done "until it is tired": that manner is about
      // spending an animal, and this item is about it not moving at all.
      { key: 'holdStill', label: 'teach it to hold still', blurb: 'Ten seconds. Then eleven.', past: 'made it hold still', memory: 'making it hold still', methods: ['train.hard', 'train.patiently'] },
      { key: 'standGround', label: 'make it stand its ground', blurb: 'Something loud goes past. It stays.', past: 'made it stand its ground', memory: 'making it stand its ground', methods: ['train.hard', 'train.patiently'] },
      { key: 'waitForFood', label: 'make it wait for the bowl', blurb: 'Trembling. Waiting. Trembling.', past: 'made it wait for the bowl', memory: 'making it wait for the bowl', methods: ['train.hard', 'train.patiently'] },
      { key: 'comeBack', label: 'call it back off something good', blurb: 'The hardest thing in the list.', past: 'called it back from something good', memory: 'calling it back from things it wanted', methods: ['train.hard', 'train.patiently'], tilt: { bond: 1 } },
      { key: 'leaveIt', label: 'teach it to leave a thing alone', blurb: 'It looks at the thing. It looks at you.', past: 'taught it to leave a thing alone', memory: 'teaching it to leave things alone', methods: ['train.hard', 'train.patiently'] },
      { key: 'settleMat', label: 'send it to its corner', blurb: 'It goes. It sighs the whole way.', past: 'sent it to its corner', memory: 'sending it to its corner', methods: ['train.patiently'] },
    ],
  },
  {
    label: 'water',
    kind: 'train',
    // Work that does not feel like work, which is why it is the only training
    // shelf carrying bond. It puts NOTHING into the creature: an earlier draft
    // had it laying down brine, and that quietly broke the rule the substance
    // channel rests on, that only feeding, giving and going places put anything
    // in. A soaked animal is not a fed one.
    push: { vigor: 3, roam: 1, bond: 1 },
    minStage: 1,
    items: [
      { key: 'swimOut', label: 'swim it out and back', blurb: 'It has no doubts at all about deep water.', past: 'swam it out and back', memory: 'swimming it out and back' },
      { key: 'wadeShallows', label: 'wade the shallows with it', blurb: 'Stamping. Endless stamping.', past: 'waded the shallows with it', memory: 'wading the shallows with it', tilt: { vigor: -1, stillness: 1 } },
      { key: 'fetchFromWater', label: 'throw something in for it', blurb: 'It comes back with a different thing entirely.', past: 'threw something into the water for it', memory: 'throwing things into the water for it', tilt: { craft: 1 } },
      { key: 'againstCurrent', label: 'work it against the current', blurb: 'Hard going, and it will not turn back.', past: 'worked it against the current', memory: 'working it against the current', tilt: { ferocity: 1 } },
      { key: 'rainWork', label: 'work it in the rain', blurb: 'Neither of you enjoys this equally.', past: 'worked it in the rain', memory: 'working it in the rain' },
    ],
  },
  {
    label: 'skill',
    kind: 'train',
    // Where the creature has to think. Craft is the point and vigor is the
    // smallest here, because working a puzzle is not the same as being spent.
    push: { vigor: 2, craft: 3 },
    minStage: 1,
    items: [
      { key: 'findHidden', label: 'hide something and send it looking', blurb: 'It goes straight past. Then straight to it.', past: 'hid something and sent it looking', memory: 'hiding things and sending it looking' },
      { key: 'openLatch', label: 'let it work out the latch', blurb: 'You will regret teaching it this.', past: 'let it work out the latch', memory: 'letting it work out latches', tilt: { ferocity: 1 } },
      { key: 'followSign', label: 'teach it one hand signal', blurb: 'It watches your hands from now on.', past: 'taught it one hand signal', memory: 'teaching it hand signals', tilt: { bond: 1 } },
      { key: 'sortByShape', label: 'set it sorting things', blurb: 'Its system is not your system. Its system works.', past: 'set it sorting things by shape', memory: 'giving it things to sort by shape' },
      { key: 'balanceBeam', label: 'walk it along the beam', blurb: 'Slow, deliberate, absurdly pleased.', past: 'walked it along the beam', memory: 'walking it along the beam', tilt: { stillness: 1 } },
      { key: 'copyYou', label: 'show it a movement to copy', blurb: 'The first time it copies you is a strange feeling.', past: 'showed it a movement to copy', memory: 'showing it movements to copy', tilt: { resonance: 1 } },
    ],
  },
]
