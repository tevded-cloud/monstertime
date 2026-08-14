// Looking after a creature.
//
// Five shelves: washing, the body, company, its place, and the small repairs.
// This is the kind that is done TO an animal rather than with it, which is why
// it carries the most bond of any of them and almost no roam at all.
//
// BOND IS ON EVERY SHELF, for the reason nourish is on every feed shelf. Being
// handled is being handled; the second axis is what separates a brush-down from
// having your teeth looked at.
//
// SEVEN KEYS ARE INHERITED AND MUST NEVER CHANGE: brushDown, cleanScrapes,
// sitNearby, trimClaws, freshBedding, checkTeeth, wakeIt. The last of those is
// the wake action and it carries whileAsleep, so it is defined in actions.ts
// rather than here: it is the one thing on this kind that is not tending.

import type { Shelf } from './catalogue'

export const TEND_SHELVES: Shelf[] = [
  {
    label: 'washing',
    kind: 'tend',
    push: { bond: 2, stillness: 2 },
    // An egg cannot be brushed or dried. Changing what it is sitting in can
    // be done from the first day, and says so on the item.
    minStage: 1,
    items: [
      { key: 'brushDown', label: 'brush it down', blurb: 'It leans into the brush until it is nearly over.' },
      { key: 'cleanScrapes', label: 'clean its scrapes', blurb: 'It holds still because it is you.' },
      { key: 'freshBedding', label: 'change its bedding', blurb: 'It gets in before you have finished.', minStage: 0 },
      { key: 'rinseFeet', label: 'rinse its feet', blurb: 'Four separate negotiations.' },
      { key: 'combTangles', label: 'work out the tangles', blurb: 'You find things in there. You do not ask.', tilt: { craft: 1 } },
      { key: 'dryOff', label: 'rub it dry', blurb: 'It shakes first, out of principle.', tilt: { vigor: 1 } },
      { key: 'washProperly', label: 'wash it properly', blurb: 'Nobody involved is happy and it has to be done.', tilt: { ferocity: 1 } },
    ],
  },
  {
    label: 'the body',
    kind: 'tend',
    // The shelf that asks an animal to allow something it would rather not.
    // Craft, because you are working on it, and it is the one that needs the
    // most patience per action.
    push: { bond: 2, craft: 2, stillness: 1 },
    // Claws, teeth, ears, eyes, ribs. An egg has none of them.
    minStage: 1,
    items: [
      { key: 'trimClaws', label: 'trim its claws', blurb: 'One at a time. Praise between each.' },
      { key: 'checkTeeth', label: 'check its teeth', blurb: 'It allows this, barely.' },
      { key: 'checkEars', label: 'look in its ears', blurb: 'It tilts its head into your hand.' },
      { key: 'checkEyes', label: 'wipe its eyes', blurb: 'It blinks at you for a while afterwards.' },
      { key: 'feelRibs', label: 'run your hands over it', blurb: 'You are checking. It thinks it is being admired.', tilt: { bond: 1 } },
      { key: 'pullThorn', label: 'get the thorn out', blurb: 'It knew. It came and showed you.', tilt: { bond: 2 } },
      { key: 'weighIt', label: 'weigh it', blurb: 'It has to be tricked onto the scale every time.', tilt: { craft: 1 } },
    ],
  },
  {
    label: 'company',
    kind: 'tend',
    // Doing nothing, on purpose. The only shelf in the whole catalogue where
    // the action is the absence of one, so it takes the most stillness and
    // refuses the manner about being quick: sitting with something quickly is
    // not sitting with it.
    push: { bond: 2, stillness: 3 },
    methods: ['tend.talking', 'tend.firmly'],
    // Sitting with a thing works whatever the thing is, so this shelf is open
    // from the first day. The two that need a body to lean say so themselves.
    minStage: 0,
    items: [
      { key: 'sitNearby', label: 'sit near it and do nothing', blurb: 'That is the whole of it.', minStage: 0 },
      { minStage: 1, key: 'sleepNearIt', label: 'fall asleep next to it', blurb: 'You wake up with a dead arm and no regrets.' },
      { key: 'watchItSleep', label: 'watch it sleep', blurb: 'Its feet move. It is somewhere else.' },
      { minStage: 1, key: 'letItLean', label: 'let it lean on you', blurb: 'Heavier than it has any right to be.' },
      { key: 'shareTheStep', label: 'sit on the step with it', blurb: 'Both facing the same way, saying nothing.' },
      { key: 'waitOutRain', label: 'wait out the rain together', blurb: 'Neither of you suggests going in.' },
    ],
  },
  {
    label: 'its place',
    kind: 'tend',
    // Looking after where it lives rather than after it. The creature is often
    // not even present, so this is the shelf with the least bond and the most
    // craft, and it is the only tending a group can do to an egg.
    push: { bond: 1, craft: 2, stillness: 1 },
    minStage: 0,
    items: [
      { key: 'sweepOut', label: 'sweep it out', blurb: 'It supervises from the doorway.' },
      { key: 'mendTheDoor', label: 'mend the door it broke', blurb: 'It will break it again. You mend it again.' },
      { key: 'movePlace', label: 'move its bed to the warm side', blurb: 'It stands in the old spot for a day, then forgives you.' },
      { key: 'freshWater', label: 'change the water', blurb: 'It drinks immediately, as if it had been waiting.', tilt: { nourish: 1 } },
      { key: 'blockDraught', label: 'block up the draught', blurb: 'You find the gap by watching where it will not lie.' },
      { key: 'hangSomething', label: 'hang something up for it', blurb: 'Turns slowly. It watches it turn.', tilt: { resonance: 1 } },
    ],
  },
  {
    label: 'small repairs',
    kind: 'tend',
    // When something is actually wrong. The one tending shelf with any ferocity
    // in it, because a hurt animal is not a calm one.
    push: { bond: 2, craft: 1, ferocity: 2 },
    // Nothing here is true of an egg: it has no leg to bind and no graze.
    minStage: 1,
    items: [
      { key: 'bindLeg', label: 'bind up a leg', blurb: 'It goes very still and lets you.' },
      { key: 'coldWater', label: 'hold it under cold water', blurb: 'It objects for exactly as long as it takes.' },
      { key: 'saltTheGraze', label: 'salt a graze', blurb: 'The look it gives you is not forgiveness.' },
      { key: 'warmCompress', label: 'hold something warm on it', blurb: 'It sighs and puts its weight on your hand.', tilt: { stillness: 2, ferocity: -1 } },
      { key: 'sitOutFever', label: 'sit up with it', blurb: 'All night. Neither of you sleeps much.', tilt: { bond: 2 } },
    ],
  },
]
