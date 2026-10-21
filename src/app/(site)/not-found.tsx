import Image from "next/image";
import Link from "next/link";

/**
 * The traveller-facing 404.
 *
 * Reached by an unknown slug, an unpublished listing, or a destination with
 * nothing in it. All three are reported identically on purpose — a distinct
 * message for "this exists but is not published" would let the URL be used to
 * probe the review queue.
 *
 * Given the approved treatment rather than a bare centred message. A 404 is a
 * page a real visitor meets, often as their first impression from a stale link
 * or a search result, and a plain one undoes a lot of the work the rest of the
 * site does.
 */
export default function NotFound() {
  return (
    <div className="relative">
      <div className="relative h-[220px] w-full overflow-hidden sm:h-[280px]">
        <Image
          src="/images/swiss-alps.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgb(243 239 231 / 0) 40%, rgb(243 239 231 / 0.75) 76%, var(--lv-bg) 100%)",
          }}
        />
      </div>

      <div className="mx-auto -mt-10 flex w-full max-w-[560px] flex-col items-center px-6 pb-24 text-center">
        <span className="text-accent-ink text-[10px] tracking-[0.24em] uppercase">Off the map</span>

        <h1 className="font-display text-heading mt-3 text-[32px] leading-[1.1] sm:text-[40px]">
          We could not find
          <br />
          that page
        </h1>

        <p className="text-fg-muted mt-4 max-w-md text-[14.5px] leading-[1.65] font-light">
          It may have moved, or it may not be published yet. Every listing is reviewed by our team
          before it appears.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/experiences"
            className="bg-cta text-cta-fg hover:bg-cta-hover rounded-pill inline-flex h-12 items-center px-7 text-[14px] font-medium transition-colors"
          >
            Browse experiences
          </Link>

          <Link
            href="/"
            className="border-line bg-surface hover:border-line-strong text-heading rounded-pill inline-flex h-12 items-center border px-7 text-[14px] transition-colors"
          >
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
}
