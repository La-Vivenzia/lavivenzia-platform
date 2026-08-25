# ADR-0012 — Light working surfaces, dark anchors

**Status:** Accepted
**Date:** 2026-08-25
**Amends:** `DESIGN.md` §3 (Visual Direction) and §33 (Anti-Patterns), for the
host and admin console only.

## Context

`DESIGN.md` is the launch design source of truth. It sets a deep-black
editorial direction throughout — §3 lists "deep black backgrounds" and
"charcoal surfaces" first among the visual language, and §33 names "white
dashboard layouts" as an anti-pattern to never introduce.

The host console is the first substantial interface the product has. It is also
the first surface where someone _works_: a host writes a two-hundred-word
description, fills in a dozen fields, uploads photographs and reads a checklist,
often for an hour at a stretch.

The founder directed that the console should not be dark throughout, that dark
should be used as an accent and anchor rather than flooding every screen, and
that light and elegant surfaces should be used where appropriate — while
retaining the existing brand colours, refined for better contrast and balance.

That is a direct conflict with two clauses of the design source of truth, so it
is recorded here rather than absorbed silently into a stylesheet.

## Decision

**Working surfaces are a warm ivory. Dark is an anchor, not a ground.**

- Canvas `#faf7f2`, a warm parchment. Explicitly **not** `#ffffff` — the
  anti-pattern §33 names is a _white_ dashboard, and clinical white is what
  makes an interface read as generic SaaS.
- Near-black `#17140f` is retained for the navigation rail, page mastheads,
  image scrims, primary buttons and the traveller-facing preview.
- Gold is split in two. The moodboard gold `#c9a84c` reads beautifully on black
  and fails contrast on ivory, so `#9a7524` carries text and fine rules on light
  surfaces while `#c9a84c` is kept for dark ones. One gold could not serve both
  grounds without failing on one of them.
- Burgundy and brown remain the rare editorial accents §5 describes.

**The traveller-facing preview stays dark.** It stands in for the marketplace
rather than being a working surface, so it keeps §3 intact — full-bleed
photography, scrim, display serif over the image.

## Rationale

The two clauses being amended are aimed at a real failure, and that failure is
avoided here by other means.

§33 forbids white dashboards because they read as generic. What makes a
dashboard generic is not luminance — it is uniform grey cards on white with no
hierarchy and no typographic voice. The console avoids that with editorial
composition, a display serif, hairline rules, wide tracking and generous
whitespace. A warm parchment ground with a black rail is closer to a printed
catalogue than to a SaaS admin panel.

§3 sets a cinematic tone for the _product_, and the product a traveller sees is
still exactly that. What changed is the register of the tool a host works in,
which is a different job. Dark interfaces are excellent for viewing photography
and poor for extended reading and form entry: long-form text on a dark ground is
measurably harder to read for most people, and every field, checklist and error
message in this console is text.

The contrast work matters more than the luminance choice. `#c9a84c` on `#0d0d0d`
is a fine display pairing and a poor one for a form label; the split palette is
what lets the brand appear on both grounds without either failing.

## Consequences

- `DESIGN.md` §3 and §33 no longer describe the console. This ADR is the
  authority for host and admin surfaces; `DESIGN.md` remains the authority for
  traveller-facing pages, which are still to be built.
- The token layer in `src/app/globals.css` is now the single source of numeric
  values, resolving assumption A-007 (design tokens, previously DEFERRED). §35
  required tokens; there were none, so screens could not be built without
  inventing values in components.
- Two golds must be maintained together. A future palette change has to move
  both or the brand splits.
- If the founder prefers the dark console after seeing it, the change is a token
  swap plus a review of contrast pairs, not a rebuild — no component carries its
  own colours.
