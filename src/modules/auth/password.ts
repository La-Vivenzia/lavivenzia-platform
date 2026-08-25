import { hash, verify } from "@node-rs/argon2";
import { assertPasswordPolicy } from "@/modules/auth/password-policy";

/*
 * The length policy lives in `password-policy.ts` and is re-exported here so
 * existing server-side imports are unchanged. It is a separate module because
 * this one loads a native addon that cannot be bundled for a browser, and the
 * sign-up form needs the minimum length.
 */
export {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  assertPasswordPolicy,
} from "@/modules/auth/password-policy";

/**
 * Password hashing (ADR-0005: argon2id).
 *
 * argon2id is chosen over bcrypt because it resists GPU and ASIC attack through
 * memory hardness, and over argon2i/argon2d because it is the hybrid variant
 * recommended by RFC 9106 for password storage.
 *
 * Parameters follow the RFC 9106 "second recommended option": 64 MiB of memory,
 * 3 passes, 4 lanes. That costs roughly 50-100 ms per hash on modern hardware —
 * slow enough to make offline cracking expensive, fast enough for an
 * interactive login.
 */
/**
 * `Algorithm.Argon2id` is an ambient const enum, which `verbatimModuleSyntax`
 * forbids importing, so its value is inlined. Verified against
 * @node-rs/argon2 index.d.ts: Argon2d = 0, Argon2i = 1, Argon2id = 2.
 */
const ARGON2ID = 2;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 65_536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const;

export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash: a corrupt row must
 * read as "authentication failed", never as a 500 that tells an attacker
 * something unusual happened.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;

  try {
    return await verify(storedHash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * A hash of a value no one can log in with, used to equalise timing when an
 * account does not exist.
 *
 * Without this, "unknown email" returns in microseconds while "wrong password"
 * takes ~80 ms, and that difference alone enumerates registered users. The
 * login path verifies against this dummy so both branches cost the same.
 *
 * Computed once on first use rather than at module load, so importing this
 * module stays cheap.
 */
let dummyHashPromise: Promise<string> | undefined;

export function getTimingEqualisationHash(): Promise<string> {
  dummyHashPromise ??= hash("timing-equalisation-placeholder-value", ARGON2_OPTIONS);
  return dummyHashPromise;
}
