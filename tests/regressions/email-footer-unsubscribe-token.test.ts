/**
 * The visible footer of an email has to carry an opt-out the recipient can
 * actually use.
 *
 * unsubscribeFooterV2 took an unsubscribe token and then dropped it: every one
 * of the ~20 V2 templates rendered the same token-less link to the account
 * -gated alerts manager. A recipient who is an EmailLead with no account (most
 * of a marketing audience) landed on "Please sign in to manage your alerts",
 * so the only working unsubscribe anywhere in the message was the machine-only
 * List-Unsubscribe header. Roughly a dozen call sites even handed the function
 * the literal preview placeholder, which is how the dropped parameter went
 * unnoticed.
 *
 * These pin the property rather than the markup: somewhere in the footer there
 * is a link whose URL carries THIS recipient's token, it does not point at the
 * sign-in wall, and a render with no token emits no token link at all rather
 * than a dead one. Labels, separators and styling are free to change.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  unsubscribeFooterV2,
  PREVIEW_UNSUB_TOKEN,
} from '@/lib/email-templates-v2';
import { type EmailType, MARKETING_EMAIL_TYPES } from '@/lib/email/email-types';
import { LIFECYCLE_EMAILS } from '@/lib/lifecycle-emails';

const h = vi.hoisted(() => ({ resendSend: vi.fn() }));

vi.unmock('@/lib/email-service');
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: h.resendSend };
    batch = { send: vi.fn() };
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendBroadcastEmail, sendEmployerMessageNotification } from '@/lib/email-service';

/** Every href in a rendered fragment, absolute or relative. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * The links that identify the recipient by `token`, parsed rather than
 * substring-matched so a wrongly escaped token fails instead of passing.
 */
function tokenLinks(html: string, token: string): URL[] {
  return hrefs(html)
    .map((href) => {
      try {
        return new URL(href, 'https://fixture.invalid');
      } catch {
        return null;
      }
    })
    .filter((url): url is URL => !!url && url.searchParams.get('token') === token);
}

/** Any link that carries some token, whatever its value. */
function anyTokenLinkCount(html: string): number {
  return hrefs(html).filter((href) => /[?&]token=/.test(href)).length;
}

/** The sign-in-walled page the footer used to send everyone to. */
const SIGN_IN_WALLED_PATH = '/job-alerts/manage';

const RECIPIENT_TOKEN = 'unsubtokfic0000000000001';

/** A marketing type, so the opt-out row is expected to render. */
const MARKETING: EmailType = 'job_alert';

describe('unsubscribeFooterV2 honours the token it is handed', () => {
  it('offers a link that identifies the recipient by their own token', () => {
    const links = tokenLinks(unsubscribeFooterV2(RECIPIENT_TOKEN, MARKETING), RECIPIENT_TOKEN);
    expect(links.length).toBeGreaterThan(0);
  });

  it('does not spend that token on the page that asks the recipient to sign in', () => {
    const links = tokenLinks(unsubscribeFooterV2(RECIPIENT_TOKEN, MARKETING), RECIPIENT_TOKEN);
    for (const url of links) {
      expect(url.pathname).not.toBe(SIGN_IN_WALLED_PATH);
    }
  });

  it('round-trips a token that needs escaping instead of splicing it in raw', () => {
    const awkward = 'tok en&value=1';
    const links = tokenLinks(unsubscribeFooterV2(awkward, MARKETING), awkward);
    expect(links.length).toBeGreaterThan(0);
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['an empty string', ''],
    ['the preview placeholder', PREVIEW_UNSUB_TOKEN],
  ])('emits no token link when given %s', (_label, token) => {
    expect(anyTokenLinkCount(unsubscribeFooterV2(token, MARKETING))).toBe(0);
  });
});

/**
 * Unsubscribing clears EmailLead.isSubscribed, which switches off every
 * marketing type at once. Offering it on a receipt means one click on a
 * refund confirmation silently cancels the job alerts the person asked for.
 * The first pass at threading the token through put the row on seven
 * transactional types that had never carried one.
 */
describe('the opt-out row appears only on mail the recipient can opt out of', () => {
  const TRANSACTIONAL: EmailType[] = [
    'welcome_signup',
    'job_confirmation',
    'renewal_confirmation',
    'refund_confirmation',
    'expiry_warning',
    'expiry_final_notice',
    'application_confirmation',
    'status_update',
    'employer_message',
  ];

  it.each(TRANSACTIONAL)('%s renders no unsubscribe link even with a real token', (emailType) => {
    expect(anyTokenLinkCount(unsubscribeFooterV2(RECIPIENT_TOKEN, emailType))).toBe(0);
  });

  it.each([...MARKETING_EMAIL_TYPES])('%s does render one', (emailType) => {
    const links = tokenLinks(unsubscribeFooterV2(RECIPIENT_TOKEN, emailType), RECIPIENT_TOKEN);
    expect(links.length).toBeGreaterThan(0);
  });

  it('still offers transactional mail the preferences page, which is a page and not a switch', () => {
    const html = unsubscribeFooterV2(RECIPIENT_TOKEN, 'refund_confirmation');
    expect(hrefs(html).some((h) => h.includes(SIGN_IN_WALLED_PATH))).toBe(true);
  });

  it('every transactional type is genuinely outside the marketing set', () => {
    // Guards the guard: if a type above were quietly reclassified as
    // marketing, its case would assert the opposite of what it claims.
    for (const t of TRANSACTIONAL) expect(MARKETING_EMAIL_TYPES.has(t)).toBe(false);
  });
});

describe('lifecycle emails carry the recipient token into the rendered footer', () => {
  for (const def of LIFECYCLE_EMAILS) {
    it(`${def.id} renders an opt-out bound to the recipient`, () => {
      const html = def.buildHtml({
        ...def.sampleContext,
        unsubscribeToken: RECIPIENT_TOKEN,
      });
      expect(tokenLinks(html, RECIPIENT_TOKEN).length).toBeGreaterThan(0);
    });

    it(`${def.id} renders no dead token link without one`, () => {
      expect(anyTokenLinkCount(def.buildHtml(def.sampleContext))).toBe(0);
    });
  }
});

describe('senders thread a real token into the footer they render', () => {
  const LEAD_TOKEN = 'leadtokfic0000000000002';

  beforeEach(() => {
    vi.clearAllMocks();
    h.resendSend.mockResolvedValue({ data: { id: 'resend-msg-fic-1' }, error: null });
    vi.mocked(prisma.emailLead.findUnique).mockResolvedValue({
      unsubscribeToken: LEAD_TOKEN,
    } as never);
    vi.mocked(prisma.emailSend.create).mockResolvedValue({ id: 'emailsend-fic-1' } as never);
  });

  /** The html actually handed to the provider on the last send. */
  function sentHtml(): string {
    expect(h.resendSend).toHaveBeenCalled();
    return h.resendSend.mock.calls.at(-1)![0].html as string;
  }

  it('a broadcast leaves with an opt-out bound to that recipient', async () => {
    const result = await sendBroadcastEmail(
      'reader@examplepsych.example',
      'A note from the team',
      '<p>Body copy.</p>',
    );

    expect(result.success).toBe(true);
    expect(tokenLinks(sentHtml(), LEAD_TOKEN).length).toBeGreaterThan(0);
  });

  it('the broadcast body survives the shell the sender now renders', async () => {
    await sendBroadcastEmail(
      'reader@examplepsych.example',
      'A note from the team',
      '<p>Body copy that must reach the reader.</p>',
    );

    expect(sentHtml()).toContain('Body copy that must reach the reader.');
  });

  it('the automated message nudge reuses the token from its unsubscribe URL', async () => {
    await sendEmployerMessageNotification(
      'seeker@examplepsych.example',
      'Riley',
      'PMHNP Hiring',
      null,
      'You have unread messages',
      'Two employers are waiting on a reply.',
      null,
      {
        emailType: 'system_message_nudge',
        intro: 'you have unread messages waiting.',
        unsubscribeUrl: `https://fixture.invalid/unsubscribe?token=${LEAD_TOKEN}`,
      },
    );

    expect(tokenLinks(sentHtml(), LEAD_TOKEN).length).toBeGreaterThan(0);
  });

  it('a human message notification, which has nothing to opt out of, renders no token link', async () => {
    await sendEmployerMessageNotification(
      'seeker@examplepsych.example',
      'Riley',
      'Dana Cole',
      'Example Behavioral Health',
      'About your profile',
      'Are you open to a conversation?',
      'PMHNP Outpatient',
    );

    expect(anyTokenLinkCount(sentHtml())).toBe(0);
  });
});
