import { env } from "@/lib/env";
import { jsonResponse, withRoute } from "@/lib/http";
import { assertSameOrigin } from "@/lib/auth-context";
import { requireHostContext } from "@/lib/host-context";
import { getExperienceService } from "@/lib/container";
import { ValidationError } from "@/lib/errors";
import { MAX_IMAGE_BYTES } from "@/modules/media/image";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/**
 * POST /api/v1/host/experiences/:id/media — attach a photograph (FR-06).
 *
 * Multipart, because the bytes come from a file input. Two things are worth
 * knowing about how it is handled:
 *
 * The size is checked **before** the bytes are read into memory, using the
 * declared size on the `File` object. Reading first and checking after would
 * mean an attacker chooses how much memory the server allocates.
 *
 * The declared content type is passed to the domain but is not believed. What
 * the file actually is gets decided by reading its leading bytes, because a
 * client sends whatever it likes.
 */
export const POST = withRoute<RouteContext>(async (request, { params }) => {
  await assertSameOrigin(env.APP_URL);

  const { id } = await params;
  const { principal, host } = await requireHostContext();

  let form: FormData;
  try {
    form = await request.formData();
  } catch (cause) {
    throw new ValidationError("Expected a multipart upload.", {}, { cause });
  }

  const file = form.get("file");

  if (!(file instanceof File)) {
    throw new ValidationError("Attach an image under the field name 'file'.");
  }

  // Cheap rejection on the declared size, before any allocation. The domain
  // re-checks the real length, so a lying Content-Length changes nothing.
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ValidationError(
      `Images must be ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB or smaller.`,
      { byteSize: file.size },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const media = await getExperienceService().addMedia(principal, host, id, {
    bytes,
    declaredType: file.type,
  });

  return jsonResponse({ media }, 201);
});
