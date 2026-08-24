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
      { key: 'brushDown', label: 'brush it down', blurb: 'It leans into the brush until it is nearly over.', past: 'brushed it down', memory: 'brushing it down' },
      { key: 'cleanScrapes', label: 'clean its scrapes', blurb: 'It holds still because it is you.', past: 'cleaned its scrapes', memory: 'cleaning its scrapes' },
      { key: 'freshBedding', label: 'change its bedding', blurb: 'Fresh straw, pushed up around the warm side.', past: 'changed its bedding', memory: 'changing its bedding', minStage: 0 },
      { key: 'rinseFeet', label: 'rinse its feet', blurb: 'Four separate negotiations.', past: 'rinsed its feet one at a time', memory: 'rinsing its feet one at a time' },
      { key: 'combTangles', label: 'work out the tangles', blurb: 'You find things in there. You do not ask.', past: 'worked the tangles out', memory: 'working out its tangles', tilt: { craft: 1 } },
      { key: 'dryOff', label: 'rub it dry', blurb: 'It shakes first, out of principle.', past: 'rubbed it dry', memory: 'rubbing it dry', tilt: { vigor: 1 } },
      { key: 'washProperly', label: 'wash it properly', blurb: 'Nobody involved is happy and it has to be done.', past: 'washed it properly', memory: 'washing it properly', tilt: { ferocity: 1 } },
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
      { key: 'trimClaws', label: 'trim its claws', blurb: 'One at a time. Praise between each.', past: 'trimmed its claws', memory: 'trimming its claws' },
      { key: 'checkTeeth', label: 'check its teeth', blurb: 'It allows this, barely.', past: 'checked its teeth', memory: 'checking its teeth' },
      { key: 'checkEars', label: 'look in its ears', blurb: 'It tilts its head into your hand.', past: 'looked in its ears', memory: 'looking in its ears' },
      { key: 'checkEyes', label: 'wipe its eyes', blurb: 'It blinks at you for a while afterwards.', past: 'wiped its eyes', memory: 'wiping its eyes' },
      { key: 'feelRibs', label: 'run your hands over it', blurb: 'You are checking. It thinks it is being admired.', past: 'ran careful hands over it', memory: 'running careful hands over it', tilt: { bond: 1 } },
      { key: 'pullThorn', label: 'get the thorn out', blurb: 'It knew. It came and showed you.', past: 'got a thorn out for it', memory: 'getting thorns out for it', tilt: { bond: 2 } },
      { key: 'weighIt', label: 'weigh it', blurb: 'It has to be tricked onto the scale every time.', past: 'coaxed it onto the scale', memory: 'coaxing it onto the scale', tilt: { craft: 1 } },
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
      { key: 'sitNearby', label: 'sit near it', blurb: 'That is the whole of it.', past: 'sat near it for a while', memory: 'sitting near it for a while', minStage: 0 },
      { minStage: 1, key: 'sleepNearIt', label: 'lie down next to it', blurb: 'You wake up with a dead arm and no regrets.', past: 'lay down next to it', memory: 'lying down next to it' },
      { key: 'watchItSleep', label: 'watch it sleep', blurb: 'Its feet move. It is somewhere else.', past: 'watched it sleep', memory: 'watching it sleep', minStage: 1 },
      { minStage: 1, key: 'letItLean', label: 'let it lean on you', blurb: 'Heavier than it has any right to be.', past: 'made room for it to lean close', memory: 'making room for it to lean close' },
      { key: 'shareTheStep', label: 'sit on the step with it', blurb: 'Both facing the same way, saying nothing.', past: 'shared the step with it', memory: 'sharing the step with it', minStage: 1 },
      { key: 'waitOutRain', label: 'wait out the rain together', blurb: 'Neither of you suggests going in.', past: 'waited out the rain with it', memory: 'waiting out the rain with it', minStage: 1 },
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
      { key: 'sweepOut', label: 'sweep it out', blurb: 'Dust, old straw, and one thing you cannot identify.', past: 'swept out its place', memory: 'sweeping out its place' },
      { key: 'mendTheDoor', label: 'mend the door it broke', blurb: 'It will break it again. You mend it again.', past: 'mended the door it broke', memory: 'mending the door it kept breaking', minStage: 1 },
      { key: 'movePlace', label: 'move its bed to the warm side', blurb: 'The warm side was there all along.', past: 'moved its bed to the warm side', memory: 'moving its bed to the warm side' },
      { key: 'freshWater', label: 'change the water', blurb: 'It drinks immediately, as if it had been waiting.', past: 'changed its water', memory: 'changing its water', minStage: 1, tilt: { nourish: 1 } },
      { key: 'blockDraught', label: 'block up the draught', blurb: 'Wool in the gap, then a hand held there to check.', past: 'blocked the draught in its place', memory: 'blocking draughts in its place' },
      { key: 'hangSomething', label: 'hang something up for it', blurb: 'Turns slowly in air that otherwise seems still.', past: 'hung something up in its place', memory: 'hanging things up in its place', tilt: { resonance: 1 } },
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
      { key: 'bindLeg', label: 'bind up a leg', blurb: 'It goes very still and lets you.', past: 'bound up one of its legs', memory: 'binding up its legs' },
      { key: 'coldWater', label: 'hold it under cold water', blurb: 'It objects for exactly as long as it takes.', past: 'held it under cold water', memory: 'holding it under cold water' },
      { key: 'saltTheGraze', label: 'salt a graze', blurb: 'The look it gives you is not forgiveness.', past: 'salted one of its grazes', memory: 'salting its grazes' },
      { key: 'warmCompress', label: 'hold something warm on it', blurb: 'It sighs and puts its weight on your hand.', past: 'held something warm against it', memory: 'holding warm things against it', methods: ['tend.talking', 'tend.firmly'], tilt: { stillness: 2, ferocity: -1 } },
      { key: 'sitOutFever', label: 'sit up with it', blurb: 'All night. Neither of you sleeps much.', past: 'sat up with it through a fever', memory: 'sitting up with it through fevers', methods: ['tend.talking', 'tend.firmly'], tilt: { bond: 2 } },
    ],
  },
]
