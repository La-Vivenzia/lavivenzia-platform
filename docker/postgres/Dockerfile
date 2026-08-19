# Local development database.
#
# No published image carries both PostGIS and pgvector, and the schema needs
# both (ADR-0004, ADR-0008). Rather than install extensions by hand — which
# makes every developer's database subtly different — this image starts from the
# official PostGIS build and adds pgvector from the PGDG apt repository that the
# base image already trusts.
#
# Pinned to PostgreSQL 16 to match the intended RDS engine version. Change both
# together, never one alone.
FROM postgis/postgis:16-3.4

# postgresql-16-pgvector comes from the PGDG repo configured in the base image.
# Version-pinning is deliberately left to the repo: pgvector patch releases are
# additive, and pinning here would silently diverge from RDS, which tracks the
# extension version AWS ships.
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*

# Extensions themselves are created by the initial Prisma migration, not here.
# That keeps local, CI, staging and production provisioned by the same SQL —
# a docker-entrypoint script would only apply locally and mask drift.
