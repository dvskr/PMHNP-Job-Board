import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

/**
 * Legacy token dashboard.
 *
 * Passwordless token access is retired: employers sign in. But renewal emails
 * sent before that change are still sitting in inboxes pointing here, and this
 * page used to redirect to a bare login screen with no listing and no context,
 * which is where those renewal pitches died.
 *
 * The token is NOT treated as a credential. It is used only to look up which
 * listing the employer was trying to renew, so that intent survives the login
 * step: sign in, land on the dashboard, renew modal already open for that
 * listing. Ownership is still enforced by the session on the dashboard itself.
 * An unknown token falls through to the normal employer login.
 */
export default async function TokenDashboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let renewTarget = '/employer/dashboard';
  if (token) {
    try {
      const owner = await prisma.employerJob.findFirst({
        where: { OR: [{ dashboardToken: token }, { editToken: token }] },
        select: { jobId: true },
      });
      if (owner?.jobId) {
        renewTarget = `/employer/dashboard?renew=${encodeURIComponent(owner.jobId)}`;
      }
    } catch {
      // A lookup failure must never block sign in; fall back to the dashboard.
    }
  }

  redirect(`/login?role=employer&redirectTo=${encodeURIComponent(renewTarget)}`);
}
