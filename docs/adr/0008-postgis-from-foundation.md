# ADR-0008: PostGIS enabled from the foundation stage

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

FR-03 makes location search, map-based discovery and **nearby discovery** launch
requirements, and `WIREFRAME.md` §3 places a map viewport in the primary
discovery interface. `System Design.png` listed PostGIS; the markdown did not.

This is the one place where the diagram is followed over the markdown, and the
justification is the explicit functional requirement rather than the diagram's
authority (see ADR-0003).

## Decision

Enable PostGIS in the initial migration.

The alternative — `double precision` latitude and longitude with bounding-box
filtering and Haversine distance in SQL — genuinely works to tens of thousands of
rows. It was rejected because it handles map-viewport queries poorly, gets
distance subtly wrong at scale, and offers no path to the polygon work
(destination boundaries, zones) that a destination-driven product will want.

The asymmetry decides it: enabling an extension is one line in a migration, while
retrofitting a spatial column onto a populated `Experience`/`Location` table that
everything references is a migration plus a backfill plus a query rewrite, under
launch pressure.

## Consequences

- **Prisma has limited PostGIS support.** `geography(Point,4326)` columns need
  `Unsupported()` mapping and spatial queries need raw SQL. Mitigation: confine
  all spatial SQL to a small number of repository methods behind the location
  service, so the friction is contained rather than spread through the codebase.
- CI must run a PostGIS-capable Postgres image.
- No spatial column exists yet — location modelling arrives with the inventory
  phase.

## Revisit when

Not expected. Removing PostGIS later would be strictly harder than adding it now,
which is the point.
