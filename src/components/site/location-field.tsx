"use client";

import { useEffect, useId, useState } from "react";

/**
 * Location search for the browse filters (FR-03).
 *
 * Three ways to say where you are, because travellers arrive in three states:
 * typing a place name, willing to share device location, or neither. The third
 * is the default and costs nothing — the whole control is optional, and every
 * other filter works without it.
 *
 * **What survives JavaScript being unavailable.** The visible input is a plain
 * text field inside the same GET form, and the coordinates ride in hidden
 * inputs that are pre-filled from the URL. So a shared link with a location in
 * it keeps working, and paginating keeps the location, with or without this
 * component ever hydrating. What is lost without JavaScript is the suggestion
 * list and the device-location button — assists, not the feature.
 *
 * The debounce is not a nicety. Autocomplete is billed per request upstream and
 * rate limited per address downstream, so issuing one per keystroke would spend
 * a traveller's whole budget spelling a city name.
 */

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

interface Suggestion {
  readonly providerPlaceId: string;
  readonly description: string;
  readonly coordinates?: { readonly latitude: number; readonly longitude: number };
}

export interface LocationFieldProps {
  /** Pre-filled from the URL, so the control reflects the current search. */
  readonly defaultLabel: string;
  readonly defaultLat: string;
  readonly defaultLng: string;
  readonly controlClassName: string;
}

export function LocationField({
  defaultLabel,
  defaultLat,
  defaultLng,
  controlClassName,
}: LocationFieldProps) {
  const listId = useId();
  const statusId = useId();

  const [label, setLabel] = useState(defaultLabel);
  const [lat, setLat] = useState(defaultLat);
  const [lng, setLng] = useState(defaultLng);
  const [suggestions, setSuggestions] = useState<readonly Suggestion[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  /**
   * The text the current coordinates correspond to.
   *
   * State rather than a ref because it participates in rendering: it decides
   * whether the suggestion list is shown. Editing the text after choosing a
   * place must drop the coordinates, or the search keeps querying the old point
   * while displaying the new name.
   */
  const [resolvedLabel, setResolvedLabel] = useState(defaultLabel);

  const query = label.trim();

  useEffect(() => {
    // Nothing to look up: the text already names a resolved place, or it is too
    // short to be one. The suggestion list is *derived* below rather than
    // cleared here — clearing state synchronously inside an effect is what
    // causes the cascading render the compiler warns about, and deriving it
    // also removes the flicker between the clear and the next result.
    if (query === resolvedLabel || query.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/v1/places/autocomplete?q=${encodeURIComponent(query)}`,
            { signal: controller.signal },
          );
          if (!response.ok) {
            setSuggestions([]);
            return;
          }

          const body = (await response.json()) as { suggestions?: readonly Suggestion[] };
          setSuggestions(body.suggestions ?? []);
        } catch {
          // An aborted or failed lookup means no suggestions, never an error
          // banner: the traveller can still type a place and submit the form.
          setSuggestions([]);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, resolvedLabel]);

  /**
   * What the datalist actually offers.
   *
   * Derived, so a too-short query shows nothing without any state being reset,
   * and so a stale response arriving after the box was emptied cannot repopulate
   * it.
   */
  const visibleSuggestions =
    query.length >= MIN_QUERY_LENGTH && query !== resolvedLabel ? suggestions : [];

  function choose(suggestion: Suggestion): void {
    setLabel(suggestion.description);
    setResolvedLabel(suggestion.description);
    setSuggestions([]);

    if (suggestion.coordinates) {
      setLat(String(suggestion.coordinates.latitude));
      setLng(String(suggestion.coordinates.longitude));
      setStatus(null);
      return;
    }

    // A provider that does not return coordinates needs the second call.
    void (async () => {
      try {
        const response = await fetch(
          `/api/v1/places/resolve?placeId=${encodeURIComponent(suggestion.providerPlaceId)}`,
        );
        if (!response.ok) throw new Error("resolve failed");

        const point = (await response.json()) as { latitude: number; longitude: number };
        setLat(String(point.latitude));
        setLng(String(point.longitude));
        setStatus(null);
      } catch {
        setLat("");
        setLng("");
        setStatus("We could not pin that place. Try another, or search without a location.");
      }
    })();
  }

  function useDeviceLocation(): void {
    if (!("geolocation" in navigator)) {
      setStatus("This browser cannot share a location.");
      return;
    }

    setLocating(true);
    setStatus(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(String(position.coords.latitude));
        setLng(String(position.coords.longitude));
        setLabel("Near me");
        setResolvedLabel("Near me");
        setSuggestions([]);
        setLocating(false);
      },
      () => {
        // Refusal is a normal answer, not an error. Said plainly, once.
        setLocating(false);
        setStatus("Location not shared. Type a place instead.");
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 },
    );
  }

  function clear(): void {
    setLabel("");
    setLat("");
    setLng("");
    setResolvedLabel("");
    setSuggestions([]);
    setStatus(null);
  }

  const hasLocation = lat !== "" && lng !== "";

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-text-muted text-[11px] font-medium tracking-[0.08em] uppercase">
          Near
        </span>
        <input
          type="text"
          name="place"
          value={label}
          onChange={(event) => {
            const next = event.target.value;

            // A `<datalist>` pick is indistinguishable from typing the same
            // string — there is no separate selection event — so an exact match
            // against a current suggestion is the only signal that someone
            // chose one. Handled here rather than in an effect, because it is a
            // response to an interaction, not a synchronisation.
            const picked = suggestions.find(
              (suggestion) => suggestion.description === next && next !== label,
            );

            if (picked) {
              choose(picked);
              return;
            }

            setLabel(next);

            // Coordinates belong to the previous text, so they are dropped the
            // moment the text stops matching them.
            if (next !== resolvedLabel) {
              setLat("");
              setLng("");
            }
          }}
          list={listId}
          autoComplete="off"
          placeholder="Anywhere"
          aria-describedby={status ? statusId : undefined}
          className={controlClassName}
        />
      </label>

      {/*
       * A native datalist rather than a custom listbox. The browser already
       * gives it keyboard navigation, screen-reader semantics and sensible
       * mobile behaviour, and a hand-rolled combobox is the classic place where
       * those quietly get lost.
       */}
      <datalist id={listId}>
        {visibleSuggestions.map((suggestion) => (
          <option key={suggestion.providerPlaceId} value={suggestion.description} />
        ))}
      </datalist>

      {/*
       * Only the coordinates. The radius is a visible select beside this
       * control, and two inputs with the same name would submit twice.
       */}
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={useDeviceLocation}
          disabled={locating}
          className="text-text-muted hover:text-gold-deep text-[11px] underline underline-offset-4 disabled:opacity-50"
        >
          {locating ? "Locating…" : "Use my location"}
        </button>

        {hasLocation ? (
          <button
            type="button"
            onClick={clear}
            className="text-text-muted hover:text-gold-deep text-[11px] underline underline-offset-4"
          >
            Clear location
          </button>
        ) : null}
      </div>

      {status ? (
        <p id={statusId} role="status" className="text-text-muted text-[11px]">
          {status}
        </p>
      ) : null}
    </div>
  );
}
