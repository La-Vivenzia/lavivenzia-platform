import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { GoldRule, Wordmark } from "@/components/ui/wordmark";
import { getPrincipal } from "@/lib/auth-context";

/**
 * The front door.
 *
 * Deliberately spare. Traveller discovery — search, destinations, collections,
 * experience pages — is a later phase, and a landing page full of placeholder
 * sections would be a promise the product cannot keep. What exists today is the
 * host side, so this page says what La Vivenzia is and shows hosts the way in.
 */
export default async function Home() {
  const principal = await getPrincipal();
  const isHost = principal?.roles.includes("host") ?? false;

  return (
    <main className="bg-ink text-text-inverse relative isolate flex min-h-dvh flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(70% 60% at 20% 10%, rgba(201,168,76,0.15), transparent 60%)," +
            "radial-gradient(60% 50% at 85% 90%, rgba(92,30,38,0.4), transparent 65%)",
        }}
      />

      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-6 py-8 sm:px-10">
        <Wordmark size="md" tone="gold" />
        <nav className="flex items-center gap-6">
          {principal ? (
            <Link
              href={isHost ? "/host" : "/become-a-host"}
              className="hover:text-gold-light text-[11px] tracking-[0.16em] uppercase transition-colors"
            >
              {isHost ? "Host console" : "Become a host"}
            </Link>
          ) : (
            <>
              <Link
                href="/become-a-host"
                className="text-text-inverse-muted hover:text-gold-light text-[11px] tracking-[0.16em] uppercase transition-colors"
              >
                Become a host
              </Link>
              <Link
                href="/sign-in"
                className="hover:text-gold-light text-[11px] tracking-[0.16em] uppercase transition-colors"
              >
                Sign in
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col justify-center px-6 py-20 sm:px-10">
        <div className="flex max-w-3xl flex-col gap-8">
          <span className="text-gold-light/80 text-[10px] tracking-[0.28em] uppercase">
            The art of experience
          </span>
          <h1 className="font-display text-[34px] leading-[1.2] sm:text-[52px]">
            Timeless memories.
            <br />A world beyond the ordinary.
          </h1>
          <GoldRule />
          <p className="text-text-inverse-muted max-w-xl text-[15px] leading-relaxed">
            A curated marketplace of experiences led by the people who know a place best. Every host
            is verified and every listing reviewed before it appears.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <ButtonLink href={isHost ? "/host" : "/become-a-host"} variant="gold" size="lg">
              {isHost ? "Open host console" : "Apply to host"}
            </ButtonLink>
            {!principal ? (
              <ButtonLink href="/sign-in" variant="inverse" size="lg">
                Sign in
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </section>

      <footer className="border-line-inverse mx-auto w-full max-w-[1120px] border-t px-6 py-8 sm:px-10">
        <p className="text-text-inverse-muted/70 text-[11px] tracking-[0.14em] uppercase">
          Traveller discovery opens with the next release
        </p>
      </footer>
    </main>
  );
}
