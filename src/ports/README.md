# Ports

Provider interfaces **owned by the domain**. The domain depends on these; it
never depends on a concrete provider (SYSTEM_DESIGN.md §10).

Rules enforced by lint (`eslint.config.mjs` → `domainBoundary`):

- No Next.js, React, or framework imports.
- No imports from `@/app`, `@/components`, or `@/adapters`.

Implementations live in `src/adapters/<provider>/` and are wired at the
composition root, not imported by domain code. Swapping Razorpay for another
gateway, or one embeddings vendor for another, must not touch `src/modules`.
