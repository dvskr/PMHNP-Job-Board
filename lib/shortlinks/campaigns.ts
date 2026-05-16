import type { ShortlinkCampaign } from './types'

/**
 * Platform letter → utm_source-style name.
 *
 * Adding a platform here is a one-line change; the resolver reads from
 * this map at runtime so no other file needs to know about it.
 */
export const PLATFORM_BY_LETTER: Readonly<Record<string, string>> = Object.freeze({
  f: 'facebook',
  i: 'instagram',
  l: 'linkedin',
  x: 'x',
  r: 'reddit',
  t: 'threads',
  p: 'program-director',
})

export const KNOWN_PLATFORM_LETTERS: ReadonlySet<string> = new Set(
  Object.keys(PLATFORM_BY_LETTER),
)

/**
 * Featured employer-submitted jobs as of 2026-05-12.
 *
 * Job ids are stable for the life of this campaign. Removing a job from
 * the array breaks any already-published post that links to it — prefer
 * pointing the slug at a permanent landing page instead.
 */
export const FEATURED_EMPLOYERS_MAY_2026: ShortlinkCampaign = Object.freeze({
  campaign: 'featured-employers-may2026',
  jobs: Object.freeze([
    { id: 1, slug: 'pmhnp-interventional-psychiatry-tmsspravato-1c287ab0-b6be-4040-bd74-9b7c56e0978c', content: 'resiliency-anaheim' },
    { id: 2, slug: 'pmhnp-interventional-psychiatry-tmsspravato-32f3a032-b189-4356-ae49-3039e284f519', content: 'resiliency-newport' },
    { id: 3, slug: 'remote-pmhnp-telehealth-il-wa-or-az-nm-01256358-df72-4c68-9449-2838c2d9c8d9', content: 'tessahealth-remote' },
    { id: 4, slug: 'founding-medical-provider-arnp-pa-c-md-interventional-psychiatry-cb2a8af0-00df-4987-8835-7eca0d4e0641', content: 'unified-founding' },
    { id: 5, slug: 'medical-provider-nppamd-ketamine-mental-health-clinic-20412db5-7f75-4a88-9113-37bb1bdd264b', content: 'unified-ketamine' },
    { id: 6, slug: 'pmhnp-ketamine-infusion-c5b72f4a-dec2-4a60-bf63-7427df40d88f', content: 'claritiv-jackson' },
    { id: 7, slug: 'medical-provider-nppamd-interventional-psychiatry-wellness-f5df2449-40ef-40d6-8db3-be8cd281532d', content: 'united-heart' },
    { id: 8, slug: 'founding-clinician-tms-brain-health-startup-nyc-b05b85cd-3db0-4175-bbdc-2b6ac042069f', content: 'pharia-nyc' },
    { id: 9, slug: 'remote-pmhnp-telehealth-outpatient-ocdanxiety-8306b4f1-1338-46c4-aee8-2e61de6dd3f8', content: 'anxiety-relief-ca' },
    { id: 10, slug: 'psychiatric-nurse-practitioner-pmhnp-c51d717f-963b-4d19-9c81-4202951a4327', content: 'clearwave-ny' },
    { id: 11, slug: 'psychiatric-nurse-practitioner-7a9478b2-ae5b-4ea1-93c5-e13ca47faaa0', content: 'sol-dc' },
  ]),
}) as ShortlinkCampaign

/**
 * Pointer to the campaign the route handler currently serves. To roll a
 * new campaign, add a new constant above and swap this export — the
 * route handler reads through it.
 */
export const ACTIVE_CAMPAIGN: ShortlinkCampaign = FEATURED_EMPLOYERS_MAY_2026
