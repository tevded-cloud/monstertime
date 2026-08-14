// What a group can feed a creature.
//
// Seven shelves and sixty-one things on them, which is the depth this was
// always specified at: fruit, vegetables, roots, meat, fish, foraged, and
// whatever you happened to be eating. Three shelves with two items each was
// never the design, it was what hand-tuning every item's pressures cost.
//
// THE PUSH AND THE SUBSTANCE ARE DECIDED ONCE PER SHELF, which is what makes
// this size possible at all. Fruit is sweet and quick; roots are heavy and put
// weight on; fish comes off the water; foraged is something the creature had to
// work for. An item tilts off its shelf only when it genuinely differs, and
// most do not: a strawberry and a blackberry are the same decision.
//
// NOURISH IS 3 ON EVERY SHELF, deliberately. What separates feeding it apples
// from feeding it liver is the SECOND axis and the substance, not how much food
// it was. A shelf that fed the creature more would make itself the correct
// answer, and there is no correct answer here.
//
// SIX KEYS ARE INHERITED AND MUST NEVER CHANGE: emberfruit, riverGreens,
// marrowBone, honeycomb, saltedFish, fromYourHand. They are in the log of every
// group that has ever fed anything, and the log is the creature.

import type { Shelf } from './catalogue'

export const FEED_SHELVES: Shelf[] = [
  {
    label: 'fruit',
    kind: 'feed',
    // Sweet and quick: it comes up bright and does not last.
    push: { nourish: 3, vigor: 2 },
    gives: { verdure: 2, ember: 1 },
    minStage: 1,
    items: [
      { key: 'emberfruit', label: 'ember-fruit', blurb: 'Split one open. It steams.', tilt: { ferocity: 1 }, gives: { ember: 3 } },
      { key: 'strawberries', label: 'strawberries', blurb: 'Gone before you have put the rest down.' },
      { key: 'pineapple', label: 'pineapple', blurb: 'It works at the tough bit long after the sweet is gone.' },
      { key: 'banana', label: 'a banana', blurb: 'Peel it or it will not forgive you.' },
      { key: 'windfallApples', label: 'windfall apples', blurb: 'Bruised on one side. It does not mind.' },
      { key: 'blackberries', label: 'blackberries', blurb: 'Its mouth is purple for the rest of the day.' },
      { key: 'splitMelon', label: 'a split melon', blurb: 'Face down in it up to the eyes.' },
      { key: 'figs', label: 'figs', blurb: 'Too sweet. It has three anyway.' },
      { key: 'sourPlums', label: 'sour plums', blurb: 'It pulls a face and comes back for another.', tilt: { ferocity: 1, vigor: -1 } },
      { key: 'cloudberries', label: 'cloudberries', blurb: 'A whole afternoon of picking, eaten in a minute.' },
      { key: 'bruisedPear', label: 'a bruised pear', blurb: 'Soft enough to eat without teeth.', tilt: { stillness: 1, vigor: -1 } },
    ],
  },
  {
    label: 'greens',
    kind: 'feed',
    // Slow and steady. Nothing about greens is exciting and that is the point.
    push: { nourish: 3, stillness: 2 },
    gives: { verdure: 3 },
    minStage: 1,
    items: [
      { key: 'riverGreens', label: 'river greens', blurb: 'Cold from the water, still dripping.' },
      { key: 'youngNettles', label: 'young nettles', blurb: 'Wilted first, unless you want to explain yourself.' },
      { key: 'beetTops', label: 'beet tops', blurb: 'The part people throw away.' },
      { key: 'wildGarlic', label: 'wild garlic', blurb: 'You will know it ate this. Everyone will.', tilt: { resonance: 1 } },
      { key: 'samphire', label: 'samphire', blurb: 'Salt on it already.', gives: { verdure: 2, brine: 2 } },
      { key: 'turnipTops', label: 'turnip tops', blurb: 'Bitter. It eats them anyway, slowly.' },
      { key: 'kale', label: 'kale', blurb: 'It takes a long time about this.' },
      { key: 'peaShoots', label: 'pea shoots', blurb: 'Sweet, and gone in one mouthful.', tilt: { vigor: 1, stillness: -1 } },
      { key: 'watercress', label: 'watercress', blurb: 'Peppery enough to make it sneeze.' },
      { key: 'dandelion', label: 'dandelion leaves', blurb: 'Picked from the yard on the way past.' },
    ],
  },
  {
    label: 'roots',
    kind: 'feed',
    // Heavy food. It puts weight on and settles the animal down.
    push: { nourish: 3, stillness: 1, craft: 1 },
    gives: { mineral: 2, verdure: 1 },
    minStage: 1,
    items: [
      { key: 'turnips', label: 'turnips', blurb: 'It has to work at these.' },
      { key: 'carrots', label: 'carrots', blurb: 'The crunch carries across the yard.' },
      { key: 'wholeBeetroot', label: 'a whole beetroot', blurb: 'Everything it touches is pink for two days.' },
      { key: 'parsnips', label: 'parsnips', blurb: 'Sweeter after a frost, and it can tell.' },
      { key: 'swede', label: 'a swede', blurb: 'Half the size of its head.' },
      { key: 'newPotatoes', label: 'new potatoes', blurb: 'Warm still. It waits, badly.' },
      { key: 'sunchokes', label: 'sunchokes', blurb: 'You will regret this by evening.', tilt: { ferocity: 1 } },
      { key: 'radishes', label: 'radishes', blurb: 'Sharp. It looks betrayed and eats the rest.' },
    ],
  },
  {
    label: 'meat',
    kind: 'feed',
    // The shelf that makes an animal harder. Nothing else here pushes ferocity
    // this far, and it is the clearest lever a group has on temperament.
    push: { nourish: 3, ferocity: 2 },
    gives: { mineral: 2, ember: 1 },
    minStage: 1,
    items: [
      { key: 'marrowBone', label: 'a marrow bone', blurb: 'It will be at this for an hour.' },
      { key: 'muttonScraps', label: 'mutton scraps', blurb: 'Off the plates, still warm.' },
      { key: 'rabbitHaunch', label: 'a rabbit haunch', blurb: 'It takes it somewhere private.' },
      { key: 'liver', label: 'liver', blurb: 'Gone in one. It looks up for more.' },
      { key: 'driedStrips', label: 'dried strips', blurb: 'Tough enough to keep it busy on a walk.', tilt: { roam: 1 } },
      { key: 'suet', label: 'suet', blurb: 'Rich. Not too often.', tilt: { stillness: 1 } },
      { key: 'knuckle', label: 'a knuckle', blurb: 'More a job than a meal.', tilt: { craft: 1 } },
      { key: 'tripe', label: 'tripe', blurb: 'You hold your breath. It does not.' },
      { key: 'sweetbreads', label: 'sweetbreads', blurb: 'Soft, and over too quickly.' },
    ],
  },
  {
    label: 'fish',
    kind: 'feed',
    // Off the water, and it takes the water with it: this is the only shelf
    // that reliably lays brine into a creature.
    push: { nourish: 3, roam: 2 },
    gives: { brine: 3 },
    minStage: 1,
    items: [
      { key: 'saltedFish', label: 'salted fish', blurb: 'It drinks for the rest of the evening.' },
      { key: 'riverTrout', label: 'a river trout', blurb: 'Caught this morning. It knows.' },
      { key: 'eels', label: 'eels', blurb: 'Still moving. Everybody steps back.', tilt: { ferocity: 1 } },
      { key: 'roe', label: 'roe', blurb: 'It eats these one at a time, carefully.', tilt: { stillness: 1, roam: -1 } },
      { key: 'smokedHerring', label: 'smoked herring', blurb: 'The smell reaches the house.' },
      { key: 'whitebait', label: 'whitebait', blurb: 'A handful at a time, like rain.' },
      { key: 'crab', label: 'a crab', blurb: 'The crab gets a say in this.', tilt: { ferocity: 1, craft: 1 } },
      { key: 'mussels', label: 'mussels', blurb: 'It works out the hinge on the second one.', tilt: { craft: 1 } },
      { key: 'pikeHead', label: 'a pike head', blurb: 'All teeth. They regard each other.', tilt: { ferocity: 1 } },
    ],
  },
  {
    label: 'foraged',
    kind: 'feed',
    // Food that took working out. The craft here is the creature's, not yours.
    push: { nourish: 2, craft: 2, roam: 1 },
    gives: { verdure: 1, ember: 1, mineral: 1 },
    minStage: 1,
    items: [
      { key: 'honeycomb', label: 'honeycomb', blurb: 'Sticky to the elbow.' },
      { key: 'acorns', label: 'acorns', blurb: 'Bitter unless you soak them. Nobody soaked them.' },
      { key: 'pineNuts', label: 'pine nuts', blurb: 'It spends longer opening than eating.' },
      { key: 'fieldMushrooms', label: 'field mushrooms', blurb: 'Picked at dawn, before the flies.' },
      { key: 'birdsEggs', label: "birds' eggs", blurb: 'Two. You put one back.', tilt: { stillness: 1 } },
      { key: 'birchSap', label: 'birch sap', blurb: 'Barely sweet. It drinks the lot.' },
      { key: 'hazelnuts', label: 'hazelnuts', blurb: 'The cracking goes on all evening.' },
      { key: 'rosehips', label: 'rosehips', blurb: 'Sour and full of hair. It is unbothered.' },
      { key: 'wildPlums', label: 'wild plums', blurb: 'Small, dark, and worth the walk.' },
    ],
  },
  {
    label: 'yours',
    kind: 'feed',
    // Not a food group. Sharing what you were having is the only shelf that is
    // about the two of you rather than about the meal, so it is the only one
    // that pushes bond, and it is thin on purpose.
    push: { nourish: 2, bond: 3 },
    gives: { ember: 1, verdure: 1 },
    minStage: 1,
    // Every item here is already "off your own plate", so a bowl and a throw
    // are both false. Sharing is done by hand or it is not sharing.
    methods: ['feed.byHand'],
    items: [
      { key: 'fromYourHand', label: 'whatever you were eating', blurb: 'Slow. It has to lean in for it.' },
      { key: 'theCrusts', label: 'the crusts', blurb: 'It prefers these to the middle. Nobody knows why.' },
      { key: 'abitOfEverything', label: 'a bit of everything', blurb: 'One of each, off the side of the plate.' },
      { key: 'lastOfThePot', label: 'the last of the pot', blurb: 'Scraped out while it watches you do it.' },
      { key: 'whatYouWereSaving', label: 'what you were saving', blurb: 'You were going to have that.', tilt: { bond: 1 } },
    ],
  },
]
