# Selecting from the GameTev research library

`D:\Programs\GameTev\research` holds 744 completed reports. `docs/research-index.json`
is every one of them, unfiltered: id, domain, title, and the full `determines`
block, which is the field that says what decisions a report governs.

## Build the list from `determines`, using THIS app's nouns

The first attempt filtered on a keyword list drawn from the discipline being
looked for (ux, interface, onboarding, readability, accessibility, friction). It
selected 276 reports. Re-running it against `determines` using MonsterTime's own
vocabulary instead (creature, body plan, colour, day/night, growth, currency,
group, deterministic, prose, audio) selected 589, and only 230 were in both.

**359 relevant reports were never shown to anybody, and 46 that were shown did
not belong.**

Thrown away by the first pass: "The Life Sim Genre" and "The Farming / Ranching
Sim Genre", for an app that is both. "Body-Plan Taxonomy Read: Classify the
Creature Before Spending a Single Shape", for an app with body plans. "Creature
Interview Script" and "Color Interview Script", for an app that generates
creatures and colours. "Day/Night and Weather Cycle Recipes: the Runtime State
Machine", one week after a day/night cycle was built without reading it. Every
bestiary specimen report, each of which declares a body plan for a real animal.

The reason it happens is that a report is named for what it is ABOUT, and a pass
is looking for what it NEEDS. A keyword list drawn from the need rejects exactly
the reports that would have answered it, and it reads as rigour because it is a
script.

## A filter narrows candidates, it does not select

589 of 744 touch a surface this app has, and much of what that catches is
Godot-specific (canvas shaders, 2D sprite rigs) and useless to a three.js web
app. A count is not a judgement. A reader still has to open the frontmatter and
decide, and a pass that reports a number rather than a verdict has selected
nothing.

## Filter per unit of work, not once globally

The right reading list for the economy is not the right reading list for the
renderer. Rebuild from the index each time.

## What is still unread, and where the yield is

- **bestiary, 14 reports, none read.** The closest match in the library to this
  app: one specimen report per real animal, each DECLARING A BODY PLAN with
  measured proportions. MonsterTime writes specimen reports about generated
  animals and its body plans are meant to grow from two to seven. Read these
  before adding a third plan or touching the Beastpedia.
- **audio, 31 reports, none read.** This app makes no sound at all. Whether that
  matters is a real product question and this domain answers it.
- **visual-trace, 60 of 78 unread.** Reading and classifying creature anatomy,
  colour bands, silhouette. This is the surface the UX audit admitted it never
  covered: it reviewed the canvas scroll handler and not whether the animal is
  legible at 375px or whether the sleeping pose reads as sleeping.
- **genres: life sim, farming sim, idle/incremental.** All three describe what
  this app is, and none was read.
