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
      { key: 'riverbank', label: 'the riverbank', blurb: 'It follows the water down and has to be called back.', past: 'walked it along the river', memory: 'walking it along the river' },
      { key: 'theShore', label: 'the shore', blurb: 'It meets a wave. The wave wins.', past: 'took it down to the shore', memory: 'taking it down to the shore', tilt: { ferocity: 1 } },
      { key: 'millPond', label: 'the mill pond', blurb: 'Flat, green, and full of things worth standing in.', past: 'walked it round the mill pond', memory: 'walking it round the mill pond' },
      { key: 'saltMarsh', label: 'the salt marsh', blurb: 'It comes back white to the knees.', past: 'crossed the salt marsh with it', memory: 'crossing the salt marsh with it' },
      { key: 'harbourWall', label: 'the harbour wall', blurb: 'Boats. It has decided about boats.', past: 'took it along the harbour wall', memory: 'taking it along the harbour wall', tilt: { craft: 1 } },
      { key: 'wetMeadow', label: 'the wet meadow', blurb: 'Every step is a small argument with the ground.', past: 'picked a way through the wet meadow with it', memory: 'picking ways through the wet meadow with it' },
      { key: 'theFalls', label: 'the falls', blurb: 'Loud enough that it stops trying to listen.', past: 'stood with it beside the falls', memory: 'standing with it beside the falls', tilt: { resonance: 1 } },
    ],
  },
  {
    label: 'high ground',
    kind: 'explore',
    push: { roam: 3, vigor: 2 },
    gives: { mineral: 2 },
    minStage: 1,
    items: [
      { key: 'oldQuarry', label: 'the old quarry', blurb: 'Everything echoes. It tries this out at length.', past: 'took it down to the quarry', memory: 'taking it down to the quarry' },
      { key: 'ridgeline', label: 'the ridgeline', blurb: 'It stands at the top and looks a long way.', past: 'hauled it up the ridge', memory: 'hauling it up the ridge', tilt: { stillness: 1 } },
      { key: 'screeSlope', label: 'the scree slope', blurb: 'Down is faster than either of you planned.', past: 'took it onto the scree slope', memory: 'taking it onto the scree slope' },
      { key: 'theCrag', label: 'the crag', blurb: 'It gets further up than you are comfortable with.', past: 'climbed the crag with it', memory: 'climbing the crag with it', tilt: { ferocity: 1 } },
      { key: 'stoneRow', label: 'the standing stones', blurb: 'It circles each one exactly once.', past: 'walked it among the standing stones', memory: 'walking it among the standing stones', tilt: { resonance: 1 } },
      { key: 'highPasture', label: 'the high pasture', blurb: 'Sheep. An understanding is reached.', past: 'took it up to the high pasture', memory: 'taking it up to the high pasture' },
    ],
  },
  {
    label: 'wild',
    kind: 'explore',
    push: { roam: 3, ferocity: 3 },
    gives: { verdure: 1, ember: 1 },
    minStage: 1,
    items: [
      { key: 'nightField', label: 'the night field', blurb: 'It hears things you do not.', past: 'walked it out into the night field', memory: 'walking it out into the night field' },
      { key: 'burnedWood', label: 'the burned wood', blurb: 'Black to the shoulder by the time you leave.', past: 'took it into the burned wood', memory: 'taking it into the burned wood' },
      { key: 'deepThicket', label: 'the thicket', blurb: 'You lose sight of it twice.', past: 'went through the thicket with it', memory: 'going through the thicket with it', tilt: { craft: 1 } },
      { key: 'foxRun', label: 'the fox run', blurb: 'It puts its nose down and stops being yours for a while.', past: 'followed the fox run with it', memory: 'following the fox run with it' },
      { key: 'oldOrchard', label: 'the gone-wild orchard', blurb: 'Windfalls, wasps, and no supervision.', past: 'let it loose in the gone-wild orchard', memory: 'letting it loose in the gone-wild orchard', tilt: { nourish: 1 } },
      { key: 'brackenSlope', label: 'the bracken', blurb: 'Taller than it is. It goes in anyway.', past: 'took it into the bracken', memory: 'taking it into the bracken' },
      { key: 'theHollow', label: 'the hollow', blurb: 'Colder in there. It does not like it and will not leave.', past: 'went down into the hollow with it', memory: 'going down into the hollow with it', tilt: { stillness: 1 } },
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
      { key: 'market', label: 'the market', blurb: 'It is offered four things and takes all four.', past: 'took it through the market', memory: 'taking it through the market' },
      { key: 'theYard', label: 'the yard behind the inn', blurb: 'Somebody drops something. Everybody wins.', past: 'stopped with it behind the inn', memory: 'stopping with it behind the inn' },
      { key: 'theBridge', label: 'the bridge', blurb: 'It watches the water go under for a long time.', past: 'took it onto the bridge', memory: 'taking it onto the bridge', tilt: { stillness: 1 } },
      { key: 'forgeDoor', label: 'the door of the forge', blurb: 'Heat and hammering. It sits just inside the line.', past: 'waited with it at the forge door', memory: 'waiting with it at the forge door', tilt: { craft: 1 }, gives: { ember: 1, mineral: 1 } },
      { key: 'churchSteps', label: 'the church steps', blurb: 'Cold stone, and someone always stops.', past: 'sat with it on the church steps', memory: 'sitting with it on the church steps' },
      { key: 'schoolWall', label: 'the wall by the school', blurb: 'Twenty small hands. It endures this well.', past: 'stood with it by the school wall', memory: 'standing with it by the school wall', tilt: { bond: 1 } },
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
      { key: 'theCave', label: 'the cave mouth', blurb: 'It goes three steps in and waits for you.', past: 'brought it to the cave mouth', memory: 'bringing it to the cave mouth', methods: ['explore.leading', 'explore.carried'] },
      { key: 'badgerSett', label: 'the sett', blurb: 'Whatever lives here is not pleased.', past: 'stopped with it at the sett', memory: 'stopping with it at the sett', tilt: { ferocity: 1 } },
      { key: 'oldMine', label: 'the old adit', blurb: 'Water somewhere below. Neither of you goes further.', past: 'brought it to the old adit', memory: 'bringing it to the old adit', methods: ['explore.leading', 'explore.carried'] },
      { key: 'rootCellar', label: 'the root cellar', blurb: 'Earth and stored apples.', past: 'went down to the root cellar with it', memory: 'going down to the root cellar with it', tilt: { nourish: 1 } },
      { key: 'culvert', label: 'the culvert', blurb: 'It fits. You do not. That is the whole outing.', past: 'followed it into the culvert', memory: 'following it into the culvert', methods: ['explore.following'] },
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
      { key: 'hedgerow', label: 'the hedgerow', blurb: 'Miles of it, and something in every yard.', past: 'walked the hedgerow with it', memory: 'walking the hedgerow with it' },
      { key: 'theDitch', label: 'the ditch', blurb: 'It walks the whole length in the bottom.', past: 'followed the ditch with it', memory: 'following the ditch with it' },
      { key: 'railBank', label: 'the embankment', blurb: 'Long grass, old iron, and a view of nothing.', past: 'climbed the embankment with it', memory: 'climbing the embankment with it' },
      { key: 'backLanes', label: 'the back lanes', blurb: 'Walls on both sides. It relaxes.', past: 'took it through the back lanes', memory: 'taking it through the back lanes', tilt: { stillness: 1 } },
      { key: 'fieldMargin', label: 'the field margin', blurb: 'Between the crop and the fence, which is its favourite kind of place.', past: 'kept to the field margin with it', memory: 'staying to the field margin with it' },
      { key: 'theTipEdge', label: 'the edge of the tip', blurb: 'You leave before it finds anything.', past: 'walked it round the edge of the tip', memory: 'walking it round the edge of the tip', tilt: { ferocity: 1 } },
    ],
  },
]
