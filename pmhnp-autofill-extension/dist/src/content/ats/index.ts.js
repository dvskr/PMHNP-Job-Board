import { workdayHandler } from "/src/content/ats/workday.ts.js";
import { greenhouseHandler } from "/src/content/ats/greenhouse.ts.js";
import { leverHandler } from "/src/content/ats/lever.ts.js";
import { icimsHandler } from "/src/content/ats/icims.ts.js";
import { ashbyHandler } from "/src/content/ats/ashby.ts.js";
import { smartrecruitersHandler } from "/src/content/ats/smartrecruiters.ts.js";
import { bamboohrHandler } from "/src/content/ats/bamboohr.ts.js";
import { genericHandler } from "/src/content/ats/generic.ts.js";
const handlers = [
  workdayHandler,
  greenhouseHandler,
  leverHandler,
  icimsHandler,
  ashbyHandler,
  smartrecruitersHandler,
  bamboohrHandler,
  genericHandler
];
export function getActiveHandler() {
  for (const handler of handlers) {
    if (handler.detect()) {
      console.log(`[PMHNP] ATS detected: ${handler.name}`);
      return handler;
    }
  }
  return genericHandler;
}
