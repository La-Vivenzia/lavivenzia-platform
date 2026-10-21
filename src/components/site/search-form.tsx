/**
 * The homepage search box.
 *
 * A plain GET form, not a client component: it submits to `/experiences`, so
 * the browser does the navigation, the query lives in the URL and the page
 * works with JavaScript unavailable. There is no client-side state to fall out
 * of step with what the server returned.
 *
 * The shape is from the approved references: a full pill on a raised surface
 * with a circular submit sitting inside it, rather than a bordered rectangle
 * with an attached button. That circle is the single most recognisable element
 * on the reference home screen, and it is gold here because this sits on the
 * ink hero — on a light ground it takes `--color-primary` instead, which is the
 * inversion the two reference screens demonstrate.
 */
export function SiteSearch() {
  return (
    <form method="get" action="/experiences" className="w-full">
      {/*
       * One rounded field containing everything, so the search reads as a
       * single object. `focus-within` moves the ring to the wrapper because the
       * input itself has no visible border to light up.
       */}
      <div className="border-line-inverse bg-surface/8 focus-within:border-gold-light hover:border-text-inverse-muted flex h-14 w-full items-center gap-3 rounded-pill border px-5 backdrop-blur transition-colors sm:h-16 sm:px-6">
        <SearchGlyph />

        <label className="min-w-0 flex-1">
          <span className="sr-only">Search experiences, places or hosts</span>
          <input
            type="search"
            name="search"
            placeholder="Where would you like to go?"
            className="text-text-inverse placeholder:text-text-inverse-muted/70 h-full w-full border-0 bg-transparent p-0 text-[15px] focus:outline-none"
          />
        </label>

        {/*
         * A circle, not a labelled button. The reference uses an arrow glyph;
         * the accessible name is carried by `sr-only` text so the control is
         * still announced as "Search".
         */}
        <button
          type="submit"
          className="bg-gold-light text-ink hover:bg-gold grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors sm:h-11 sm:w-11"
        >
          <span className="sr-only">Search</span>
          <ArrowGlyph />
        </button>
      </div>
    </form>
  );
}

/** Magnifier. Inline so the search box carries no icon-library dependency. */
function SearchGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      className="text-text-inverse-muted h-5 w-5 shrink-0"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** The submit arrow from the reference. */
function ArrowGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
    >
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
