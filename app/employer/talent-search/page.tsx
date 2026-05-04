/**
 * /employer/talent-search has been folded into the canonical talent pool
 * page at /employer/candidates. The Smart Match toggle on that page calls
 * /api/employer/talent/search behind the same tier gates.
 *
 * This redirect exists so any inbound link / bookmark from the brief stub
 * UI lands on the right page instead of a 404.
 */

import { redirect } from 'next/navigation';

export default function TalentSearchRedirect(): never {
    redirect('/employer/candidates?ai=1');
}
