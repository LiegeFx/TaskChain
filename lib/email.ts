// lib/email.ts
//
// Email delivery channel for notifications, behind a transport interface.
// When RESEND_API_KEY is set, emails go through the Resend HTTP API (plain
// fetch, no SDK dependency). Otherwise a console transport logs the message
// so development works without any provider configured.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

export class ConsoleEmailTransport implements EmailTransport {
  readonly name = "console";

  async send(message: EmailMessage): Promise<void> {
    console.log(
      `[email:console] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
    );
  }
}

const RESEND_API_URL = "https://api.resend.com/emails";
// Dispatch is awaited on request paths, so a hung provider must not be able
// to stall a route response indefinitely.
const RESEND_TIMEOUT_MS = 10_000;

export class ResendEmailTransport implements EmailTransport {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend API error ${res.status}: ${body}`);
    }
  }
}

let _transport: EmailTransport | null = null;

export function getEmailTransport(): EmailTransport {
  if (!_transport) {
    const apiKey = process.env.RESEND_API_KEY;
    _transport = apiKey
      ? new ResendEmailTransport(
          apiKey,
          process.env.EMAIL_FROM ?? "TaskChain <notifications@taskchain.app>",
        )
      : new ConsoleEmailTransport();
  }
  return _transport;
}

// Test seam: inject a fake transport, or pass null to re-resolve from env.
export function setEmailTransport(transport: EmailTransport | null): void {
  _transport = transport;
}

/**
 * Sends an email through the configured transport. Never throws: failures
 * are logged and reported as `false` so notification dispatch can continue.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const transport = getEmailTransport();
  try {
    await transport.send(message);
    return true;
  } catch (err) {
    console.error(`[email:${transport.name}] send failed:`, err);
    return false;
  }
}
