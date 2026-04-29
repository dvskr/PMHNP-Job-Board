/**
 * Inngest serve endpoint.
 *
 * Inngest's hosted runtime POSTs here to invoke registered functions.
 * Functions are defined in lib/inngest/functions/* and aggregated below.
 *
 * Activation: set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY in Vercel
 * env. Until then, this route still mounts but functions don't get
 * invoked from outside (the Inngest dashboard shows "no events").
 */

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { fpRecoveryFunctions } from '@/lib/inngest/functions/fp-recovery';

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        ...fpRecoveryFunctions,
    ],
});
