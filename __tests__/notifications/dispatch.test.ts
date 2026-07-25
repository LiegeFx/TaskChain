import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  dispatchNotification,
  buildNotificationContent,
  type NotificationType,
} from '@/lib/notifications';
import {
  sendEmail,
  getEmailTransport,
  setEmailTransport,
  ConsoleEmailTransport,
  ResendEmailTransport,
  type EmailMessage,
  type EmailTransport,
} from '@/lib/email';
import { sql } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}));

class FakeTransport implements EmailTransport {
  readonly name = 'fake';
  sent: EmailMessage[] = [];
  failWith: Error | null = null;

  async send(message: EmailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }
}

const notificationRow = (type: string) => ({
  id: 'n-1',
  user_id: 'u-1',
  type,
  payload: {},
  is_read: false,
  created_at: new Date('2026-01-01T00:00:00Z'),
});

describe('buildNotificationContent', () => {
  it('formats milestone_submitted', () => {
    const content = buildNotificationContent('milestone_submitted', {
      milestoneName: 'Design mockups',
    });
    expect(content.title).toBe('Milestone submitted');
    expect(content.body).toContain('Design mockups');
  });

  it('formats funds_released', () => {
    const content = buildNotificationContent('funds_released', {
      amount: '500.00 USDC',
      milestoneName: 'Phase 1',
    });
    expect(content.title).toBe('Funds released');
    expect(content.body).toContain('500.00 USDC');
    expect(content.body).toContain('Phase 1');
  });

  it('formats dispute_raised', () => {
    const content = buildNotificationContent('dispute_raised', {
      reason: 'Deliverables missing',
    });
    expect(content.title).toBe('Dispute opened');
    expect(content.body).toContain('Deliverables missing');
  });

  it('formats wallet_activity', () => {
    const content = buildNotificationContent('wallet_activity', {
      description: 'Your wallet funded the escrow contract',
      amount: '1000 USDC',
    });
    expect(content.title).toBe('Wallet activity');
    expect(content.body).toContain('funded the escrow contract');
    expect(content.body).toContain('1000 USDC');
  });

  it('falls back to generic wording when payload fields are missing', () => {
    const types: NotificationType[] = [
      'milestone_submitted',
      'funds_released',
      'dispute_raised',
      'wallet_activity',
    ];
    for (const type of types) {
      const content = buildNotificationContent(type, {});
      expect(content.title.length).toBeGreaterThan(0);
      expect(content.body.length).toBeGreaterThan(0);
    }
  });
});

describe('dispatchNotification', () => {
  let transport: FakeTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new FakeTransport();
    setEmailTransport(transport);
    delete process.env.NOTIFICATIONS_EMAIL_DISABLED;
  });

  afterEach(() => {
    setEmailTransport(null);
  });

  it('persists in-app and sends email', async () => {
    (sql as any)
      .mockResolvedValueOnce([notificationRow('milestone_submitted')])
      .mockResolvedValueOnce([{ email: 'client@example.com' }]);

    const result = await dispatchNotification('u-1', 'milestone_submitted', {
      milestoneName: 'Phase 1',
    });

    expect(result.inApp).toBe(true);
    expect(result.email).toBe(true);
    expect(result.notification?.type).toBe('milestone_submitted');
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].to).toBe('client@example.com');
    expect(transport.sent[0].subject).toBe('Milestone submitted');
    expect(transport.sent[0].text).toContain('Phase 1');
  });

  it('still persists in-app when email sending fails', async () => {
    transport.failWith = new Error('smtp down');
    (sql as any)
      .mockResolvedValueOnce([notificationRow('funds_released')])
      .mockResolvedValueOnce([{ email: 'client@example.com' }]);

    const result = await dispatchNotification('u-1', 'funds_released', {
      amount: '500.00 USDC',
    });

    expect(result.inApp).toBe(true);
    expect(result.email).toBe(false);
  });

  it('still emails when in-app persistence fails', async () => {
    (sql as any)
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce([{ email: 'client@example.com' }]);

    const result = await dispatchNotification('u-1', 'dispute_raised', {
      reason: 'No response',
    });

    expect(result.inApp).toBe(false);
    expect(result.notification).toBeNull();
    expect(result.email).toBe(true);
    expect(transport.sent).toHaveLength(1);
  });

  it('skips email when the user has no email address', async () => {
    (sql as any)
      .mockResolvedValueOnce([notificationRow('wallet_activity')])
      .mockResolvedValueOnce([]);

    const result = await dispatchNotification('u-1', 'wallet_activity', {});

    expect(result.inApp).toBe(true);
    expect(result.email).toBe(false);
    expect(transport.sent).toHaveLength(0);
  });

  it('respects channel overrides', async () => {
    (sql as any).mockResolvedValueOnce([{ email: 'client@example.com' }]);

    const result = await dispatchNotification(
      'u-1',
      'wallet_activity',
      {},
      { inApp: false },
    );

    expect(result.inApp).toBe(false);
    expect(result.email).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('respects NOTIFICATIONS_EMAIL_DISABLED', async () => {
    process.env.NOTIFICATIONS_EMAIL_DISABLED = 'true';
    (sql as any).mockResolvedValueOnce([notificationRow('escrow_funded')]);

    const result = await dispatchNotification('u-1', 'escrow_funded', {});

    expect(result.inApp).toBe(true);
    expect(result.email).toBe(false);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(transport.sent).toHaveLength(0);
  });
});

describe('email transport selection', () => {
  const originalKey = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    setEmailTransport(null);
  });

  it('falls back to the console transport when no provider is configured', () => {
    delete process.env.RESEND_API_KEY;
    setEmailTransport(null);
    expect(getEmailTransport()).toBeInstanceOf(ConsoleEmailTransport);
  });

  it('uses the Resend transport when RESEND_API_KEY is set', () => {
    process.env.RESEND_API_KEY = 're_test_key';
    setEmailTransport(null);
    expect(getEmailTransport()).toBeInstanceOf(ResendEmailTransport);
  });

  it('bounds Resend API calls with a timeout signal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const resend = new ResendEmailTransport('re_key', 'T <t@t.t>');
      await resend.send({ to: 'a@b.c', subject: 's', text: 't' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sendEmail returns false instead of throwing on transport failure', async () => {
    const failing = new FakeTransport();
    failing.failWith = new Error('boom');
    setEmailTransport(failing);

    await expect(
      sendEmail({ to: 'a@b.c', subject: 's', text: 't' }),
    ).resolves.toBe(false);
  });
});
