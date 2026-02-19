import type { ATSHandler } from '@/shared/types';
import { workdayHandler } from './workday';
import { greenhouseHandler } from './greenhouse';
import { leverHandler } from './lever';
import { icimsHandler } from './icims';
import { ashbyHandler } from './ashby';
import { smartrecruitersHandler } from './smartrecruiters';
import { bamboohrHandler } from './bamboohr';
import { adpHandler } from './adp';
import { ukgHandler } from './ukg';
import { taleoHandler } from './taleo';
import { indeedHandler } from './indeed';
import { linkedinHandler } from './linkedin';
import { jobviteHandler } from './jobvite';
import { jazzhrHandler } from './jazzhr';
import { paylocityHandler } from './paylocity';
import { genericHandler } from './generic';
import { log, warn } from '@/shared/logger';

// Order matters: most common ATS first, generic last
// LinkedIn and Indeed first since they're the most common for healthcare job seekers
const handlers: ATSHandler[] = [
    linkedinHandler,
    indeedHandler,
    workdayHandler,
    greenhouseHandler,
    leverHandler,
    icimsHandler,
    adpHandler,
    ukgHandler,
    taleoHandler,
    smartrecruitersHandler,
    ashbyHandler,
    bamboohrHandler,
    jobviteHandler,
    jazzhrHandler,
    paylocityHandler,
    genericHandler,
];

export function getActiveHandler(): ATSHandler {
    for (const handler of handlers) {
        if (handler.detect()) {
            log(`[PMHNP] ATS detected: ${handler.name}`);
            return handler;
        }
    }
    return genericHandler;
}
