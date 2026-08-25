"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { ApiError, api } from "@/lib/api-client";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/modules/media/image";
import { EXPERIENCE_LIMITS } from "@/modules/experiences/readiness";
import type { MediaRecord } from "@/modules/experiences/ports";

/**
 * The gallery (FR-06).
 *
 * Reordering uses explicit move controls rather than drag and drop. Dragging is
 * pleasant with a mouse and close to unusable with a keyboard or a screen
 * reader, and the first image is the cover — the single most important thing on
 * the listing — so it has to be reachable by everyone.
 */

const ACCEPT = Object.keys(ALLOWED_IMAGE_TYPES).join(",");
const MAX_MB = Math.floor(MAX_IMAGE_BYTES / (1024 * 1024));

interface MediaManagerProps {
  readonly experienceId: string;
  readonly media: readonly MediaRecord[];
  readonly disabled: boolean;
  readonly onChange: (media: readonly MediaRecord[]) => void;
}

export function MediaManager({ experienceId, media, disabled, onChange }: MediaManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const base = `/api/v1/host/experiences/${experienceId}/media`;
  const atLimit = media.length >= EXPERIENCE_LIMITS.media.max;

  async function reload(): Promise<void> {
    const { experience } = await api.get<{
      experience: { experience: { media: readonly MediaRecord[] } };
    }>(`/api/v1/host/experiences/${experienceId}`);
    onChange(experience.experience.media);
  }

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;

    setError(null);
    setUploading(true);

    try {
      // Sequential, not parallel. Positions are allocated from the current
      // maximum, so concurrent uploads would race for the same slot and land in
      // an order the host did not choose.
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        await api.upload(base, form);
      }

      await reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That image could not be uploaded.");
    } finally {
      setUploading(false);
      // Clear the input so choosing the same file again still fires a change.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function saveAltText(mediaId: string, altText: string): Promise<void> {
    setBusyId(mediaId);
    try {
      await api.patch(`${base}/${mediaId}`, { altText: altText.trim() === "" ? null : altText });
      await reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We could not save that caption.");
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Move an image one place.
   *
   * Both affected images are repositioned, because position is stored per row
   * rather than as a list — swapping one without the other leaves two images
   * claiming the same slot.
   */
  async function move(index: number, direction: -1 | 1): Promise<void> {
    const target = index + direction;
    const current = media[index];
    const neighbour = media[target];
    if (!current || !neighbour) return;

    setBusyId(current.id);
    try {
      await api.patch(`${base}/${current.id}`, { position: neighbour.position });
      await api.patch(`${base}/${neighbour.id}`, { position: current.position });
      await reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We could not reorder the gallery.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(mediaId: string): Promise<void> {
    setBusyId(mediaId);
    try {
      await api.delete(`${base}/${mediaId}`);
      await reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "We could not remove that image.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {media.length === 0 ? (
        <div className="border-line bg-surface-sunken flex flex-col items-center gap-3 border border-dashed px-6 py-12 text-center">
          <p className="font-display text-[16px]">No photographs yet</p>
          <p className="text-text-muted max-w-sm text-[13px] leading-relaxed">
            The first image becomes the cover. Landscape photographs work best — they are what a
            traveller sees before they read a word.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-px">
          {media.map((item, index) => (
            <li
              key={item.id}
              className="bg-surface border-line flex flex-col gap-4 border p-4 sm:flex-row sm:items-start sm:gap-5"
            >
              <div className="bg-surface-sunken relative aspect-[4/3] w-full shrink-0 overflow-hidden sm:w-40">
                <Image
                  src={item.url}
                  alt={item.altText ?? ""}
                  fill
                  sizes="(min-width: 640px) 160px, 100vw"
                  className="object-cover"
                />
                {index === 0 ? (
                  <span className="bg-ink text-text-inverse absolute top-0 left-0 px-2 py-1 text-[9px] tracking-[0.14em] uppercase">
                    Cover
                  </span>
                ) : null}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-text-muted text-[11px] font-medium tracking-[0.08em] uppercase">
                    Description
                    <span aria-hidden="true" className="text-gold ml-1">
                      *
                    </span>
                  </span>
                  <input
                    type="text"
                    defaultValue={item.altText ?? ""}
                    disabled={disabled || busyId === item.id}
                    maxLength={200}
                    placeholder="Describe what is in the photograph"
                    // Saved on blur rather than on every keystroke: one request
                    // per caption instead of one per character.
                    onBlur={(event) => {
                      if (event.target.value !== (item.altText ?? "")) {
                        void saveAltText(item.id, event.target.value);
                      }
                    }}
                    className="border-line-strong hover:border-text-subtle focus:border-gold w-full border-0 border-b bg-transparent px-0 py-1.5 text-[14px] transition-colors focus:outline-none disabled:cursor-not-allowed"
                  />
                  <span className="text-text-subtle text-[11px]">
                    Read aloud to travellers using a screen reader, and shown if the image fails to
                    load.
                  </span>
                </label>

                {!disabled ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void move(index, -1)}
                      disabled={index === 0 || busyId !== null}
                    >
                      Move up
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void move(index, 1)}
                      disabled={index === media.length - 1 || busyId !== null}
                    >
                      Move down
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => void remove(item.id)}
                      disabled={busyId !== null}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!disabled ? (
        <div className="flex flex-col gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <div className="flex flex-wrap items-center gap-4">
            <Button
              type="button"
              loading={uploading}
              disabled={atLimit}
              onClick={() => inputRef.current?.click()}
            >
              {media.length === 0 ? "Add photographs" : "Add more"}
            </Button>
            <p className="text-text-subtle text-[12px]">
              {atLimit
                ? `Maximum of ${EXPERIENCE_LIMITS.media.max} photographs reached.`
                : `JPEG, PNG or WebP · up to ${MAX_MB} MB each · ${media.length}/${EXPERIENCE_LIMITS.media.max}`}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
