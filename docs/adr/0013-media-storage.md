# ADR-0013 — Experience media: server-mediated storage now, S3 later

**Status:** Accepted
**Date:** 2026-08-25
**Extends:** ADR-0011 (the same transport pattern, applied to object storage)

## Context

FR-06 makes media part of an experience listing, and a listing without
photographs cannot be reviewed, cannot be sold, and cannot look like a premium
travel product.

`StoragePort` already existed as a boundary, shaped entirely around **presigned
direct upload**: the browser sends bytes straight to S3 and they never transit
the app server. That is the right production shape — it keeps a request thread
from being held open for the length of someone's upload.

It is also unbuildable today. There is no AWS account (the same one that is
holding up SES), so there is no bucket to sign against and no credential to sign
with.

## Decision

**Add a server-mediated `put` to `StoragePort`, and implement it locally.**

The port now carries both shapes. `createSignedUpload` remains the production
path and remains unimplemented. `put`, `remove` and `publicUrl` are implemented
by a local adapter that writes under `public/`, which Next.js serves statically.

Selection mirrors the email transport exactly: `MEDIA_STORAGE=local|s3`, local by
default, and **local is refused in production** at both the startup invariant
and the wiring.

## Rationale

The alternative was to leave media as a boundary until AWS arrives. That was
rejected for the same reason ADR-0011 rejected it for email: the integration
would then be written against an account nobody has tested with, and the whole
flow above it — validate, store, record, serve, reorder, delete — would be
unexercised. Every one of those steps is provider-independent, and every one of
them is where the bugs actually are.

Writing to `public/` rather than serving through a route handler is deliberate.
Experience media is public content by definition; it is what travellers browse.
Putting a route in front of it would add an authorization check that always
passes and a Node process in the path of every image.

**Local is refused in production, and not for tidiness.** A container filesystem
is ephemeral. Uploads would appear to save and then vanish on the next deploy —
silent data loss that surfaces weeks later when a host asks where their
photographs went. That is worse than an outage, because nothing reports it.

## Consequences

**The declared content type is never trusted.** Files are identified by their
magic bytes. SVG is refused despite being a valid image format: it is a
script-execution vector dressed as a picture, and these files are served from
our own origin.

**Keys are entirely server-generated** — `experiences/<id>/<uuid>.<ext>`. The
client contributes no part of the path, so there is no filename to traverse out
of and no second extension to smuggle through. The local adapter additionally
resolves the path and asserts the result is still inside the media root, because
path resolution is where traversal bugs actually land.

**Rows are written after bytes, deleted before them.** A gallery row therefore
never points at a missing object; a failed delete leaves an orphaned file
instead. Of the two failure modes only one is visible to a traveller.

**The URL is not persisted.** It is derived from the storage key by whichever
adapter is wired, so moving bucket or CDN is configuration rather than a data
migration.

**Bytes transit the app server for now.** That is the cost of not having S3, and
it is bounded by an 8 MB ceiling checked against the declared size before
anything is read into memory. It goes away when `createSignedUpload` is built.

## What AWS must supply

1. A media bucket, private, with a CloudFront distribution in front of it —
   `publicUrl` returns the distribution URL, not the bucket URL.
2. An IAM policy for the task role: `s3:PutObject` and `s3:DeleteObject` scoped
   to `experiences/*` in that bucket.
3. `MEDIA_STORAGE=s3` and `S3_MEDIA_BUCKET` in Secrets Manager / SSM.
