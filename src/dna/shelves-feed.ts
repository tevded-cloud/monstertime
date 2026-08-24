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
// NOURISH IS 4 ON ALMOST EVERY SHELF, deliberately. What separates feeding it apples
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
    push: { nourish: 4, vigor: 2 },
    gives: { verdure: 2, ember: 1 },
    minStage: 1,
    items: [
      { key: 'emberfruit', label: 'ember-fruit', blurb: 'Split one open. It steams.', past: 'split an ember-fruit for it', memory: 'splitting ember-fruit for it', tilt: { ferocity: 1 }, gives: { ember: 3 } },
      { key: 'strawberries', label: 'strawberries', blurb: 'Gone before you have put the rest down.', past: 'gave it strawberries', memory: 'setting strawberries out for it' },
      { key: 'pineapple', label: 'pineapple', blurb: 'It works at the tough bit long after the sweet is gone.', past: 'fed it opened pineapple', memory: 'opening pineapples for it' },
      { key: 'banana', label: 'a banana', blurb: 'Peel it or it will not forgive you.', past: 'gave it a peeled banana', memory: 'peeling bananas for it' },
      { key: 'windfallApples', label: 'windfall apples', blurb: 'Bruised on one side. It does not mind.', past: 'offered it bruised windfall apples', memory: 'gathering windfall apples for it' },
      { key: 'blackberries', label: 'blackberries', blurb: 'Its mouth is purple for the rest of the day.', past: 'fed it blackberries', memory: 'feeding it blackberries' },
      { key: 'splitMelon', label: 'a split melon', blurb: 'Face down in it up to the eyes.', past: 'fed it half a melon', memory: 'cutting melons open for it', methods: ['feed.byHand', 'feed.inABowl'] },
      { key: 'figs', label: 'figs', blurb: 'Too sweet. It has three anyway.', past: 'gave it three figs', memory: 'letting it have three figs' },
      { key: 'sourPlums', label: 'sour plums', blurb: 'It pulls a face and comes back for another.', past: 'gave it sour plums', memory: 'giving it sour plums', tilt: { ferocity: 1, vigor: -1 } },
      { key: 'cloudberries', label: 'cloudberries', blurb: 'A whole afternoon of picking, eaten in a minute.', past: 'fed it cloudberries', memory: 'bringing it cloudberries' },
      { key: 'bruisedPear', label: 'a bruised pear', blurb: 'Soft enough to eat without teeth.', past: 'gave it a bruised pear', memory: 'saving bruised pears for it', tilt: { stillness: 1, vigor: -1 } },
    ],
  },
  {
    label: 'greens',
    kind: 'feed',
    // Slow and steady. Nothing about greens is exciting and that is the point.
    push: { nourish: 4, stillness: 2 },
    gives: { verdure: 3 },
    minStage: 1,
    items: [
      { key: 'riverGreens', label: 'river greens', blurb: 'Cold from the water, still dripping.', past: 'fed it dripping river greens', memory: 'bringing it river greens' },
      { key: 'youngNettles', label: 'young nettles', blurb: 'Wilted first, unless you want to explain yourself.', past: 'gave it wilted young nettles', memory: 'wilting young nettles for it' },
      { key: 'beetTops', label: 'beet tops', blurb: 'The part people throw away.', past: 'fed it beet tops', memory: 'saving beet tops for it' },
      { key: 'wildGarlic', label: 'wild garlic', blurb: 'You will know it ate this. Everyone will.', past: 'gave it wild garlic', memory: 'giving it wild garlic', tilt: { resonance: 1 } },
      { key: 'samphire', label: 'samphire', blurb: 'Salt on it already.', past: 'fed it dripping samphire', memory: 'bringing it samphire', gives: { verdure: 2, brine: 2 } },
      { key: 'turnipTops', label: 'turnip tops', blurb: 'Bitter. It eats them anyway, slowly.', past: 'gave it turnip tops', memory: 'serving it turnip tops' },
      { key: 'kale', label: 'kale', blurb: 'It takes a long time about this.', past: 'fed it kale', memory: 'waiting while it ate kale' },
      { key: 'peaShoots', label: 'pea shoots', blurb: 'Sweet, and gone in one mouthful.', past: 'gave it pea shoots', memory: 'passing it pea shoots', tilt: { vigor: 1, stillness: -1 } },
      { key: 'watercress', label: 'watercress', blurb: 'Peppery enough to make it sneeze.', past: 'fed it watercress', memory: 'feeding it watercress' },
      { key: 'dandelion', label: 'dandelion leaves', blurb: 'Picked from the yard on the way past.', past: 'fed it dandelion leaves', memory: 'picking dandelion leaves for it' },
    ],
  },
  {
    label: 'roots',
    kind: 'feed',
    // Heavy food. It puts weight on and settles the animal down.
    push: { nourish: 4, stillness: 1, craft: 1 },
    gives: { mineral: 2, verdure: 1 },
    minStage: 1,
    items: [
      { key: 'turnips', label: 'turnips', blurb: 'It has to work at these.', past: 'fed it whole turnips', memory: 'watching it work through turnips' },
      { key: 'carrots', label: 'carrots', blurb: 'The crunch carries across the yard.', past: 'fed it carrots', memory: 'feeding it carrots' },
      { key: 'wholeBeetroot', label: 'a whole beetroot', blurb: 'Everything it touches is pink for two days.', past: 'gave it a whole beetroot', memory: 'giving it whole beetroot' },
      { key: 'parsnips', label: 'parsnips', blurb: 'Sweeter after a frost, and it can tell.', past: 'gave it frost-sweetened parsnips', memory: 'saving parsnips until the frost for it' },
      { key: 'swede', label: 'a swede', blurb: 'Half the size of its head.', past: 'offered it a swede', memory: 'offering it swedes' },
      { key: 'newPotatoes', label: 'new potatoes', blurb: 'Warm still. It waits, badly.', past: 'fed it cooled new potatoes', memory: 'cooling new potatoes for it' },
      { key: 'sunchokes', label: 'sunchokes', blurb: 'You will regret this by evening.', past: 'fed it sunchokes anyway', memory: 'feeding it sunchokes anyway', tilt: { ferocity: 1 } },
      { key: 'radishes', label: 'radishes', blurb: 'Sharp. It looks betrayed and eats the rest.', past: 'let it try radishes', memory: 'letting it try radishes' },
    ],
  },
  {
    label: 'meat',
    kind: 'feed',
    // The shelf that makes an animal harder. Nothing else here pushes ferocity
    // this far, and it is the clearest lever a group has on temperament.
    push: { nourish: 4, ferocity: 3 },
    gives: { mineral: 2, ember: 1 },
    minStage: 1,
    items: [
      { key: 'marrowBone', label: 'a marrow bone', blurb: 'It will be at this for an hour.', past: 'gave it a marrow bone', memory: 'leaving marrow bones out' },
      { key: 'muttonScraps', label: 'mutton scraps', blurb: 'Off the plates, still warm.', past: 'fed it warm mutton scraps', memory: 'scraping mutton from the plates for it' },
      { key: 'rabbitHaunch', label: 'a rabbit haunch', blurb: 'It takes it somewhere private.', past: 'gave it a rabbit haunch', memory: 'giving it rabbit haunches' },
      { key: 'liver', label: 'liver', blurb: 'Gone in one. It looks up for more.', past: 'fed it liver', memory: 'feeding it liver' },
      { key: 'driedStrips', label: 'dried strips', blurb: 'Tough enough to keep it busy on a walk.', past: 'gave it dried strips for the walk', memory: 'packing dried strips for its walks', tilt: { roam: 1 } },
      { key: 'suet', label: 'suet', blurb: 'Rich. Not too often.', past: 'gave it suet', memory: 'giving it suet', tilt: { stillness: 1 } },
      { key: 'knuckle', label: 'a knuckle', blurb: 'More a job than a meal.', past: 'gave it a knuckle to work on', memory: 'setting it to work on knuckles', tilt: { craft: 1 } },
      { key: 'tripe', label: 'tripe', blurb: 'You hold your breath. It does not.', past: 'fed it tripe', memory: 'feeding it tripe' },
      { key: 'sweetbreads', label: 'sweetbreads', blurb: 'Soft, and over too quickly.', past: 'fed it sweetbreads', memory: 'saving sweetbreads for it' },
    ],
  },
  {
    label: 'fish',
    kind: 'feed',
    // Off the water, and it takes the water with it: this is the only shelf
    // that reliably lays brine into a creature.
    push: { nourish: 4, roam: 2 },
    gives: { brine: 3 },
    minStage: 1,
    items: [
      { key: 'saltedFish', label: 'salted fish', blurb: 'It drinks for the rest of the evening.', past: 'fed it salted fish', memory: 'carrying salted fish back for it' },
      { key: 'riverTrout', label: 'a river trout', blurb: 'Caught this morning. It knows.', past: 'gave it a morning trout', memory: 'bringing it morning trout' },
      { key: 'eels', label: 'eels', blurb: 'Still moving. Everybody steps back.', past: 'gave it live eels', memory: 'giving it live eels', methods: ['feed.inABowl'], tilt: { ferocity: 1 } },
      { key: 'roe', label: 'roe', blurb: 'It eats these one at a time, carefully.', past: 'fed it roe', memory: 'feeding it roe', methods: ['feed.byHand', 'feed.inABowl'], tilt: { stillness: 1, roam: -1 } },
      { key: 'smokedHerring', label: 'smoked herring', blurb: 'The smell reaches the house.', past: 'fed it smoked herring', memory: 'unwrapping smoked herring for it' },
      { key: 'whitebait', label: 'whitebait', blurb: 'A handful at a time, like rain.', past: 'gave it handfuls of whitebait', memory: 'giving it handfuls of whitebait' },
      { key: 'crab', label: 'a crab', blurb: 'The crab gets a say in this.', past: 'gave it a crab', memory: 'putting crabs in with it', methods: ['feed.inABowl'], tilt: { ferocity: 1, craft: 1 } },
      { key: 'mussels', label: 'mussels', blurb: 'It works out the hinge on the second one.', past: 'gave it mussels to open', memory: 'giving it mussels to open', methods: ['feed.byHand', 'feed.inABowl'], tilt: { craft: 1 } },
      { key: 'pikeHead', label: 'a pike head', blurb: 'All teeth. They regard each other.', past: 'brought it a pike head', memory: 'bringing it pike heads', methods: ['feed.byHand', 'feed.inABowl'], tilt: { ferocity: 1 } },
    ],
  },
  {
    label: 'foraged',
    kind: 'feed',
    // Food that took working out. The craft here is the creature's, not yours.
    push: { nourish: 3, craft: 2, roam: 1 },
    gives: { verdure: 1, ember: 1, mineral: 1 },
    minStage: 1,
    items: [
      { key: 'honeycomb', label: 'honeycomb', blurb: 'Sticky to the elbow.', past: 'fed it honeycomb', memory: 'feeding it honeycomb' },
      { key: 'acorns', label: 'acorns', blurb: 'Bitter unless you soak them. Nobody soaked them.', past: 'fed it unsoaked acorns', memory: 'forgetting to soak its acorns' },
      { key: 'pineNuts', label: 'pine nuts', blurb: 'It spends longer opening than eating.', past: 'gave it pine nuts to open', memory: 'bringing it pine nuts to open' },
      { key: 'fieldMushrooms', label: 'field mushrooms', blurb: 'Picked at dawn, before the flies.', past: 'fed it dawn-picked field mushrooms', memory: 'picking field mushrooms for it' },
      { key: 'birdsEggs', label: "birds' eggs", blurb: 'Two. You put one back.', past: "gave it one bird's egg", memory: "bringing it birds' eggs", tilt: { stillness: 1 } },
      { key: 'birchSap', label: 'birch sap', blurb: 'Barely sweet. It drinks the lot.', past: 'drew birch sap for it', memory: 'drawing birch sap for it', methods: ['feed.inABowl'] },
      { key: 'hazelnuts', label: 'hazelnuts', blurb: 'The cracking goes on all evening.', past: 'gave it hazelnuts', memory: 'gathering hazelnuts for it' },
      { key: 'rosehips', label: 'rosehips', blurb: 'Sour and full of hair. It is unbothered.', past: 'let it have the rosehips whole', memory: 'letting it have rosehips whole' },
      { key: 'wildPlums', label: 'wild plums', blurb: 'Small, dark, and worth the walk.', past: 'fed it wild plums', memory: 'walking out for wild plums for it' },
    ],
  },
  {
    label: 'yours',
    kind: 'feed',
    // Not a food group. Sharing what you were having is the only shelf that is
    // about the two of you rather than about the meal, so it is the only one
    // that pushes bond, and it is thin on purpose.
    push: { nourish: 3, bond: 2 },
    gives: { ember: 1, verdure: 1 },
    minStage: 1,
    // Every item here is already off your own plate, so a bowl is false: it is
    // not in a bowl, it is in your hand. Handing it over or tossing it across
    // are both true, and they are different enough to be worth asking.
    methods: ['feed.byHand', 'feed.thrown'],
    items: [
      { key: 'fromYourHand', label: 'whatever you were eating', blurb: 'Slow. It has to lean in for it.', past: 'shared part of the meal with it', memory: 'sharing meals with it' },
      { key: 'theCrusts', label: 'the crusts', blurb: 'It prefers these to the middle. Nobody knows why.', past: 'gave it the crusts', memory: 'giving it the crusts' },
      { key: 'abitOfEverything', label: 'a bit of everything', blurb: 'One of each, off the side of the plate.', past: 'shared a bit of everything with it', memory: 'sharing a bit of everything with it' },
      { key: 'lastOfThePot', label: 'the last of the pot', blurb: 'Scraped out while it watches you do it.', past: 'gave it the last of the pot', memory: 'scraping out the last of the pot for it' },
      { key: 'whatYouWereSaving', label: 'what you were saving', blurb: 'You were going to have that.', past: 'gave it what had been saved', memory: 'giving it the part meant for later', tilt: { bond: 1 } },
    ],
  },
]
