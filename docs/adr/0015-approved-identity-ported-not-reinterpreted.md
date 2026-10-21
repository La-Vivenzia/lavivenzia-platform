# ADR-0015: The approved identity is ported, not reinterpreted

- **Status:** Accepted
- **Date:** 2026-09-08
- **Decides:** how the founder-approved visual identity reaches the product, and which token vocabulary survives

## Context

The founders approved a visual direction and supplied three reference images in
`public/uirefrence/`. Two are the same mobile home screen in light and dark; the
third is a desktop marketing page.

A first attempt reinterpreted those screenshots — extracting colours by sampling
pixels, then rebuilding the hero, shortcuts and rails as new components. It
produced something close to the references and not equal to them, and it missed
details that a screenshot cannot carry: that the call to action inverts by
ground, and that a second approved palette exists at all.

Inspection then established that the images were rendered from a working
Next.js application, present on the same machine, with 26 components and a
complete two-axis token system. **The screenshots were an output of a source we
already had.**

## Decision

**Port the approved implementation. Do not reinterpret its output.**

Its components, CSS token system and photography were brought into the platform
as-is. Where the platform's stricter settings rejected code — an unchecked index
read, a `setState` in an effect — the code was corrected at the source and the
reason recorded, rather than the settings being loosened.

**Two token vocabularies coexist.** `--lv-*` and its `bg/fg/accent/cta/panel`
utilities serve the public site. The older `ink/gold/text/line/canvas` names
serve the host and operations consoles.

That is not an oversight and not duplication. The approved references cover the
traveller surface only. Restyling an operator's review queue on the strength of
a traveller home screen would be extrapolating past what was approved, which the
brief expressly forbade. Where the two vocabularies overlap the values agree,
because the console tokens were repointed at the approved palette first.

**The approved design is applied, but capability is not implied.** The
references show Stays, AI Genie and Trips. None has a backend. Those surfaces
are not mounted, and `CLAUDE.md` §7 is the reason: the interface must not
promise what the product cannot do.

## Consequences

Easier: the product matches the references exactly rather than approximately,
and inherited light/dark plus the green/blue palette that the images never
showed. Future reference updates are a re-port, not a re-derivation.

Harder: two token vocabularies is more to hold in mind than one, and a
contributor may reasonably try to unify them. `DESIGN.md` §A.6 and this record
are the answer to that impulse.

Watched: the demo is not a dependency and receives no updates. If it changes,
nothing here changes automatically — this was a port, not a link.

A dependency was added, `lucide-react`, because the approved components use it.
It is the only one this milestone introduced.

## Revisit when

- An approved reference exists for the host or operations console. At that point
  the console vocabulary can be retired into `--lv-*` and this ADR superseded.
- Stays, AI discovery or itineraries ship, at which point the unmounted
  components are mounted rather than rebuilt.
- The founders approve a change to the identity, which is a re-port of the
  source rather than an edit of the values here.
