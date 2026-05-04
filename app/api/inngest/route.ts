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
import { evalDriftFunctions } from '@/lib/inngest/functions/eval-drift';
import { embeddingFunctions } from '@/lib/inngest/functions/embeddings';
import { recommendationFunctions } from '@/lib/inngest/functions/recommendations';
import { recommendationDigestFunctions } from '@/lib/inngest/functions/recommendation-digest';

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        ...fpRecoveryFunctions,
        ...evalDriftFunctions,
        ...embeddingFunctions,
        ...recommendationFunctions,
        ...recommendationDigestFunctions,
    ],
});
