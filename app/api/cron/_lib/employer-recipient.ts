/**
 * Who receives a posting-management email.
 *
 * The expiry sequence and the monthly performance report both embed
 * EmployerJob.dashboardToken in the message body. That token is a bearer
 * credential: anyone holding the link can edit, pause, renew or take down the
 * listing without logging in.
 *
 * EmployerJob.contactEmail is the wrong place to send one. It is free text
 * typed into the post form (see the quotaDomain note on the model: a recruiter
 * posting on behalf of a client, a multi-brand org, or simply a typo), and
 * nothing ever verifies it. The owning account's email is verified by
 * construction, because it is the address the employer signs in with. That is
 * the same reasoning lib/match-digest-service records for refusing
 * contactEmail outright.
 *
 * Postings with no linked account keep contactEmail, deliberately. Anonymous
 * checkouts and legacy rows have no other channel, and dropping the expiry
 * notice would cost a paying customer their listing without telling them. The
 * residual exposure there is the address the payer themselves supplied at
 * checkout, which is a materially smaller surface than "every posting".
 */
export interface ManagementRecipientRow {
    contactEmail: string;
    user?: { email: string | null } | null;
}

export function resolveManagementRecipient(row: ManagementRecipientRow): string {
    return row.user?.email || row.contactEmail;
}
