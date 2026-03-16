/**
 * Remove dead slugs from Lever and Greenhouse aggregator files.
 * Run with: npx tsx scripts/remove-dead-slugs.ts
 */

import * as fs from 'fs';

const LEVER_DEAD = ["lifestance", "synapticure", "ucsf", "cerebral", "donehealth", "brightside", "alma", "headway", "growtherapy", "rula", "springhealth", "modernhealth", "ginger", "pathccm", "valera", "regroup", "teladochealth"];

const GREENHOUSE_DEAD = ["sondermind", "signifyhealth", "appsumocareers", "apex.careers", "apollobehavior.com", "applyethos.com", "appointmentreminder.us", "arkanamedical.co", "arnoldvethospital.com", "autonomywork.com", "averyshouseidaho.com", "axisteletherapy.services", "bluebirdbio.com", "buildingmaterialscareer.com", "carpe.io", "cartwheel.org", "coalitionrisk.com", "daywithoutchildcare.org", "ddahvero.com", "dentalartslab.com", "dentalschoolloans.org", "dialoguehealthtechnologiesinc", "divedental.com", "elitedentalpartners.com", "evgspecialty.com", "frontera.health", "garnerhealthconfidential", "gasparinsurance.com", "glyphic.bio", "gravitians.com", "habitathealth.com", "healthgorilla", "instride.health", "jadebiosciences.com", "javacareers.ai", "joinneurahealth.com", "joinrightway.com", "kaleidacare.com", "kapsupportsystem.info", "kible.health", "kincellbio.com", "mantraforedu.com", "medeloop.cc", "meetflamingo.com", "memora.health", "millcreekacademydaycare.com", "mindsandassembly.com", "montaihealth.com", "moodhealth.com", "nkartatx.com", "oakmark.jobs", "obrienvetgroup.com", "ogilvyhealth.com", "oneoncology.com", "orilliadentist.com", "paragoninsgroup.com", "petersenpethospital.com", "podvita.com", "pophealthcomms.com", "portworx.com", "prosperhealth.io", "quartetvet.com", "quipcare.com", "rightwayhealthcare.com", "seaporttx.com", "seluxdx.com", "serenehealth.com", "signifyhealthireland", "start-recast.com", "stride.careers", "talknitrogen.com", "thehotresignation.com", "theincidentcompany.io", "thepatientslawyer.com", "thepharmacyhub.com", "thrivemarketjobs.com", "timberlyne-tx.com", "totalbondbethel.com", "transcarent.com", "trmlabs", "truepill.com", "umzim.com", "upwardhealth.com", "vailhealthbh.org", "weavehealth.com", "weekdaydoc.com", "wellnestfertility.com", "talkiatry", "brightside", "brightsidehealth", "springhealth", "lyrahealth", "teladoc", "mdlive", "hims", "crosscountry", "northwell", "providence", "commonspirit", "lifestancehealth", "lifestance", "elliementalhealth", "thriveworks", "incident.io", "fulfilled"];

function removeDeadSlugs(filePath: string, deadSlugs: string[], sourceName: string) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const deadSet = new Set(deadSlugs);

    let removedCount = 0;
    const newLines: string[] = [];

    for (const line of lines) {
        // Match lines like '  'slug',  // comment' or '  'slug','
        const match = line.match(/^\s*'([a-z0-9._\-:\/]+)'/);
        if (match && deadSet.has(match[1])) {
            removedCount++;
            continue; // Skip this line
        }
        newLines.push(line);
    }

    fs.writeFileSync(filePath, newLines.join('\n'));
    console.log(`[${sourceName}] Removed ${removedCount} dead slug lines from ${filePath}`);
    console.log(`  File: ${lines.length} lines → ${newLines.length} lines (${lines.length - newLines.length} removed)`);
}

// Also remove from COMPANY_NAMES objects
function removeDeadCompanyNames(filePath: string, deadSlugs: string[], sourceName: string) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const deadSet = new Set(deadSlugs);

    let removedCount = 0;
    const newLines: string[] = [];

    for (const line of lines) {
        // Match lines like "  'slug': 'Company Name',"
        const match = line.match(/^\s*'([a-z0-9._\-:\/]+)':/);
        if (match && deadSet.has(match[1])) {
            removedCount++;
            continue;
        }
        newLines.push(line);
    }

    fs.writeFileSync(filePath, newLines.join('\n'));
    console.log(`[${sourceName}] Removed ${removedCount} company name entries`);
}

console.log('=== Removing Dead Slugs ===\n');

// 1. Lever
removeDeadSlugs('lib/aggregators/lever.ts', LEVER_DEAD, 'Lever');
removeDeadCompanyNames('lib/aggregators/lever.ts', LEVER_DEAD, 'Lever');

// 2. Greenhouse
removeDeadSlugs('lib/aggregators/greenhouse.ts', GREENHOUSE_DEAD, 'Greenhouse');

console.log('\nDone! Dead slugs removed.');
console.log(`Lever: ${LEVER_DEAD.length} slugs removed`);
console.log(`Greenhouse: ${GREENHOUSE_DEAD.length} slugs removed`);
