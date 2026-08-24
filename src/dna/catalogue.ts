// catalogue.ts: what a group can do, and where the character of it lives.
//
// WHY THIS FILE EXISTS. Every action used to carry its own pressures and its
// own substance, hand-tuned one at a time. That is workable for thirty-six
// things and it is the reason there were only ever thirty-six: each new item
// was a balance decision, so the tree got SORTED into shelves rather than
// filled, and shelves ended up with one thing on them. "the riverbank" was a
// whole category. Offering a group two vegetables is not a menu.
//
// So the character moved up a level. A SHELF says what that kind of thing does
// to a creature: fruit is sweet and quick, roots are heavy and slow, fish comes
// off the water. An ITEM is a name, a line of description, and at most a small
// tilt away from its shelf. Adding thirty fruits is thirty names, not thirty
// tuning problems, and the axis balance the genetics reads is decided once per
// shelf where somebody can actually see it.
//
// Nothing downstream knows this happened. The shelves expand into the same flat
// ActionVariant list at load, so expression, the allele draw, the tray and every
// test read exactly what they read before.
//
// TWO RULES THAT ARE NOT NEGOTIABLE.
//
// Item keys are FOREVER. An id appears in the action log of every group that
// ever did that thing, and the log is the creature: `feed.emberfruit` has to
// stay `feed.emberfruit` or a creature loses part of what made it. Rename a
// label freely; never a key.
//
// A manner has to be able to be true. Manners attach per kind, so all three
// singing manners were offered for every singing item, and "whistle from across
// the field" was offered "up close". An item that already contains a manner
// names the ones that still make sense in `methods`.

import { SUBSTANCE_AXES, PRESSURE_AXES } from '../core/types'
import type { ActionKind, ActionVariant, PressureDelta, SubstanceDelta } from '../core/types'

/**
 * A shelf inside a kind. The push and the substance live here, once, for
 * everything on it.
 */
interface Shelf {
  /** The chip a person taps. Also the category on every variant it makes. */
  label: string
  kind: ActionKind
  push: PressureDelta
  gives?: SubstanceDelta
  /** Below this stage the whole shelf is unavailable. An egg cannot be fed. */
  minStage?: number
  /** Manner ids this shelf allows. Absent means every manner of its kind. */
  methods?: string[]
  items: Item[]
}

interface Item {
  /**
   * The half of the id after the kind. NEVER changed once shipped: it is in the
   * log of every group that did this, and the log is the creature.
   */
  key: string
  label: string
  blurb: string
  /** A small nudge off the shelf, for an item that genuinely differs. Kept
   *  small on purpose: a shelf whose items all tilt is a shelf that has not
   *  decided what it is. */
  tilt?: PressureDelta
  /** Replaces the shelf's substance outright, for the rare item that is made of
   *  something else. */
  gives?: SubstanceDelta
  minStage?: number
  /** Narrower than the shelf, for an item that already carries a manner. */
  methods?: string[]
  /**
   * How it reads after somebody did it: "fed it strawberries".
   *
   * REQUIRED, and beside the item rather than in a table at the far end of
   * another file, because a table is a thing you forget to add a row to. 186
   * items shipped without one and the ticker fell back to the button label, so
   * the app told a group "You strawberries."
   */
  past: string
  /**
   * The same thing said about a habit, for the chronicle: "bringing it
   * strawberries". Written about somebody afterwards rather than to them at the
   * moment, which is why it is a separate line and not derived.
   */
  memory: string
}

function merge(base: PressureDelta, tilt: PressureDelta | undefined): PressureDelta {
  if (tilt === undefined) return { ...base }
  // Walked in the catalogue's own axis order rather than the object's, because
  // key order is an engine detail and two clients disagreeing about it would
  // add these in different orders and drift apart in the last bit.
  const out: PressureDelta = { ...base }
  for (const axis of PRESSURE_AXES) {
    const amount = tilt[axis]
    if (amount === undefined) continue
    out[axis] = (out[axis] ?? 0) + amount
  }
  return out
}

/** The flat list everything downstream reads. Built once, at load. */
export function expand(shelves: Shelf[]): ActionVariant[] {
  const out: ActionVariant[] = []
  for (const shelf of shelves) {
    for (const item of shelf.items) {
      const gives = item.gives ?? shelf.gives
      out.push({
        id: `${shelf.kind}.${item.key}`,
        category: shelf.label,
        kind: shelf.kind,
        label: item.label,
        blurb: item.blurb,
        push: merge(shelf.push, item.tilt),
        ...(gives === undefined ? {} : { gives: { ...gives } }),
        ...(item.minStage ?? shelf.minStage) === undefined
          ? {}
          : { minStage: item.minStage ?? shelf.minStage },
        ...(item.methods ?? shelf.methods) === undefined
          ? {}
          : { methods: item.methods ?? shelf.methods },
        past: item.past,
        memory: item.memory,
      })
    }
  }
  return out
}

/** Every substance axis a shelf can draw on, so a typo is a compile error
 *  rather than an item that quietly feeds the creature nothing. */
export type { Shelf, Item }
export const SUBSTANCES = SUBSTANCE_AXES
