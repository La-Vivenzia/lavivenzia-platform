/**
 * Browser-side access to the versioned API.
 *
 * Thin on purpose: it does not know about hosts or experiences, only about how
 * this API reports success and failure. Every screen goes through it, so an
 * error is surfaced the same way everywhere and no component invents its own
 * fetch conventions.
 */

import type { ErrorResponseBody } from "@/lib/errors";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string | undefined;
  /** Field-level detail, when the server sent any. */
  readonly issues: readonly { path: string; message: string }[];

  constructor(input: {
    status: number;
    code: string;
    message: string;
    correlationId?: string;
    issues?: readonly { path: string; message: string }[];
  }) {
    super(input.message);
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.correlationId = input.correlationId;
    this.issues = input.issues ?? [];
  }
}

interface ErrorBodyWithIssues extends ErrorResponseBody {
  error: ErrorResponseBody["error"] & {
    issues?: readonly { path: string; message: string }[];
  };
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorBodyWithIssues | undefined;

  try {
    body = (await response.json()) as ErrorBodyWithIssues;
  } catch {
    // A response that is not JSON is still a failure; it just cannot explain
    // itself. Fall through to the generic message rather than throwing here and
    // losing the status code.
  }

  return new ApiError({
    status: response.status,
    code: body?.error.code ?? "INTERNAL",
    message: body?.error.message ?? "Something went wrong. Please try again.",
    ...(body?.error.correlationId ? { correlationId: body.error.correlationId } : {}),
    ...(body?.error.issues ? { issues: body.error.issues } : {}),
  });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      // Sent explicitly so the server-side origin check has something to
      // compare against, and so the request is unambiguously same-site.
      "content-type": "application/json",
      ...init.headers,
    },
    // The session cookie is httpOnly; this is what attaches it.
    credentials: "same-origin",
  });

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: "GET" }),

  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),

  patch: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),

  delete: <T>(path: string): Promise<T> => request<T>(path, { method: "DELETE" }),

  /**
   * Multipart upload.
   *
   * The content-type header is deliberately omitted: the browser must set it
   * itself so it can append the multipart boundary. Setting it by hand produces
   * a body the server cannot parse.
   */
  upload: async <T>(path: string, form: FormData): Promise<T> => {
    const response = await fetch(path, {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });

    if (!response.ok) throw await toApiError(response);
    return (await response.json()) as T;
  },
};
