import type { EmailMessage, EmailPort } from "@/ports/email";
import { NotImplementedError } from "@/lib/errors";

/** Amazon SES adapter — integration boundary only. */
export class SesEmailAdapter implements EmailPort {
  send(_message: EmailMessage): Promise<{ providerMessageId: string }> {
    throw new NotImplementedError(
      "Email sending is not implemented: notification delivery is a later phase (FR-12).",
    );
  }
}
