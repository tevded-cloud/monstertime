// Where a group can take a creature.
//
// Six shelves, and they are places rather than activities: water, high ground,
// wild, town, underground, and the edges. What a creature picks up is where it
// has been, which is why this is the kind that carries the most varied
// substance: quarries put mineral into an animal, the shore puts brine.
//
// ROAM IS ON EVERY SHELF, for the reason nourish is on every feed shelf. Going
// somewhere is going somewhere. What separates the quarry from the market is
// the second axis, not the distance.
//
// SIX KEYS ARE INHERITED AND MUST NEVER CHANGE: riverbank, oldQuarry,
// nightField, market, ridgeline, burnedWood.

import type { Shelf } from './catalogue'

export const EXPLORE_SHELVES: Shelf[] = [
  {
    label: 'water',
    kind: 'explore',
    push: { roam: 3, stillness: 1 },
    gives: { brine: 2 },
    minStage: 1,
    items: [
      { key: 'riverbank', label: 'the riverbank', blurb: 'It follows the water down and has to be called back.' },
      { key: 'theShore', label: 'the shore', blurb: 'It meets a wave. The wave wins.', tilt: { ferocity: 1 } },
      { key: 'millPond', label: 'the mill pond', blurb: 'Flat, green, and full of things worth standing in.' },
      { key: 'saltMarsh', label: 'the salt marsh', blurb: 'It comes back white to the knees.' },
      { key: 'harbourWall', label: 'the harbour wall', blurb: 'Boats. It has decided about boats.', tilt: { craft: 1 } },
      { key: 'wetMeadow', label: 'the wet meadow', blurb: 'Every step is a small argument with the ground.' },
      { key: 'theFalls', label: 'the falls', blurb: 'Loud enough that it stops trying to listen.', tilt: { resonance: 1 } },
    ],
  },
  {
    label: 'high ground',
    kind: 'explore',
    push: { roam: 3, vigor: 2 },
    gives: { mineral: 2 },
    minStage: 1,
    items: [
      { key: 'oldQuarry', label: 'the old quarry', blurb: 'Everything echoes. It tries this out at length.' },
      { key: 'ridgeline', label: 'the ridgeline', blurb: 'It stands at the top and looks a long way.', tilt: { stillness: 1 } },
      { key: 'screeSlope', label: 'the scree slope', blurb: 'Down is faster than either of you planned.' },
      { key: 'theCrag', label: 'the crag', blurb: 'It gets further up than you are comfortable with.', tilt: { ferocity: 1 } },
      { key: 'stoneRow', label: 'the standing stones', blurb: 'It circles each one exactly once.', tilt: { resonance: 1 } },
      { key: 'highPasture', label: 'the high pasture', blurb: 'Sheep. An understanding is reached.' },
    ],
  },
  {
    label: 'wild',
    kind: 'explore',
    push: { roam: 3, ferocity: 3 },
    gives: { verdure: 1, ember: 1 },
    minStage: 1,
    items: [
      { key: 'nightField', label: 'the night field', blurb: 'It hears things you do not.' },
      { key: 'burnedWood', label: 'the burned wood', blurb: 'Black to the shoulder by the time you leave.' },
      { key: 'deepThicket', label: 'the thicket', blurb: 'You lose sight of it twice.', tilt: { craft: 1 } },
      { key: 'foxRun', label: 'the fox run', blurb: 'It puts its nose down and stops being yours for a while.' },
      { key: 'oldOrchard', label: 'the gone-wild orchard', blurb: 'Windfalls, wasps, and no supervision.', tilt: { nourish: 1 } },
      { key: 'brackenSlope', label: 'the bracken', blurb: 'Taller than it is. It goes in anyway.' },
      { key: 'theHollow', label: 'the hollow', blurb: 'Colder in there. It does not like it and will not leave.', tilt: { stillness: 1 } },
    ],
  },
  {
    label: 'town',
    kind: 'explore',
    // People, and the noise of them. The only place shelf that pushes bond,
    // because the creature spends it working out who everybody is.
    push: { roam: 3, resonance: 1, bond: 1 },
    minStage: 1,
    items: [
      { key: 'market', label: 'the market', blurb: 'It is offered four things and takes all four.' },
      { key: 'theYard', label: 'the yard behind the inn', blurb: 'Somebody drops something. Everybody wins.' },
      { key: 'theBridge', label: 'the bridge', blurb: 'It watches the water go under for a long time.', tilt: { stillness: 1 } },
      { key: 'forgeDoor', label: 'the door of the forge', blurb: 'Heat and hammering. It sits just inside the line.', tilt: { craft: 1 }, gives: { ember: 1, mineral: 1 } },
      { key: 'churchSteps', label: 'the church steps', blurb: 'Cold stone, and someone always stops.' },
      { key: 'schoolWall', label: 'the wall by the school', blurb: 'Twenty small hands. It endures this well.', tilt: { bond: 1 } },
    ],
  },
  {
    label: 'underground',
    kind: 'explore',
    // Dark and close. The shelf that takes the most nerve, and the only one
    // where an animal has to be led rather than following its nose.
    push: { roam: 2, ferocity: 2, craft: 1 },
    gives: { mineral: 2 },
    minStage: 1,
    items: [
      { key: 'theCave', label: 'the cave mouth', blurb: 'It goes three steps in and waits for you.', methods: ['explore.leading', 'explore.carried'] },
      { key: 'badgerSett', label: 'the sett', blurb: 'Whatever lives here is not pleased.', tilt: { ferocity: 1 } },
      { key: 'oldMine', label: 'the old adit', blurb: 'Water somewhere below. Neither of you goes further.', methods: ['explore.leading', 'explore.carried'] },
      { key: 'rootCellar', label: 'the root cellar', blurb: 'Earth and stored apples.', tilt: { nourish: 1 } },
      { key: 'culvert', label: 'the culvert', blurb: 'It fits. You do not. That is the whole outing.', methods: ['explore.following'] },
    ],
  },
  {
    label: 'the edges',
    kind: 'explore',
    // Neither one thing nor another: hedgerows, ditches, the backs of places.
    // Where an animal learns to look sideways.
    push: { roam: 2, craft: 2, ferocity: 1 },
    gives: { verdure: 1, mineral: 1 },
    minStage: 1,
    items: [
      { key: 'hedgerow', label: 'the hedgerow', blurb: 'Miles of it, and something in every yard.' },
      { key: 'theDitch', label: 'the ditch', blurb: 'It walks the whole length in the bottom.' },
      { key: 'railBank', label: 'the embankment', blurb: 'Long grass, old iron, and a view of nothing.' },
      { key: 'backLanes', label: 'the back lanes', blurb: 'Walls on both sides. It relaxes.', tilt: { stillness: 1 } },
      { key: 'fieldMargin', label: 'the field margin', blurb: 'Between the crop and the fence, which is its favourite kind of place.' },
      { key: 'theTipEdge', label: 'the edge of the tip', blurb: 'You leave before it finds anything.', tilt: { ferocity: 1 } },
    ],
  },
]
