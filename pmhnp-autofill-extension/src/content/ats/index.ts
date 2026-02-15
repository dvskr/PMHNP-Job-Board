import type { ATSHandler } from '@/shared/types';
import { workdayHandler } from './workday';
import { greenhouseHandler } from './greenhouse';
import { leverHandler } from './lever';
import { icimsHandler } from './icims';
import { ashbyHandler } from './ashby';
import { smartrecruitersHandler } from './smartrecruiters';
import { bamboohrHandler } from './bamboohr';
import { genericHandler } from './generic';

// Order matters: specific handlers first, generic last
const handlers: ATSHandler[] = [
    workdayHandler,
    greenhouseHandler,
    leverHandler,
    icimsHandler,
    ashbyHandler,
    smartrecruitersHandler,
    bamboohrHandler,
    genericHandler,
];

export function getActiveHandler(): ATSHandler {
    for (const handler of handlers) {
        if (handler.detect()) {
            console.log(`[PMHNP] ATS detected: ${handler.name}`);
            return handler;
        }
    }
    return genericHandler;
}
