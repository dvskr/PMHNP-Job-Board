/**
 * Category × City pSEO Template Factory
 * 
 * THE 50K MULTIPLIER: A single shared component that renders pages for
 * any category (setting or specialty) × any city combination.
 * 
 * Each page includes genuine, unique content:
 * - Local market demand score
 * - Cost-of-living adjusted salary
 * - Healthcare landscape for the area
 * - Mental health provider shortage indicators
 * - Community profile
 * - Nearby city cross-links
 * - State licensure quick reference
 */
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import {
  TrendingUp, Building2, Bell, MapPin, Lightbulb,
  DollarSign, Users, AlertTriangle, Activity, Heart, Shield, ArrowRight,
} from 'lucide-react';
import { cache } from 'react';
import { withTagFallback } from './category-tagger';
import { shouldRenderCategoryCity } from './render-gate';
import { JOB_LISTING_OMIT } from './job-listing-omit';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryHero from '@/components/CategoryHero';
import { Job } from '@/lib/types';
import { CityData } from './city-data/types';
import { getCityBySlug } from './city-data/cities';
import { SETTING_CONFIGS, SettingConfig, stateToSlug } from './setting-state-config';
import { CATEGORY_ASSET_REGISTRY } from './category-asset-registry';
import {
  getStatePracticeAuthority,
  getAuthorityColor,
  StatePracticeInfo,
  PracticeAuthority,
} from '@/lib/state-practice-authority';
import { PseoPageViewTracker } from '@/components/analytics/ViewTrackers';
import { buildCityFacts, buildTaxonomyCityNarrative } from './city-narrative';

// ─── Category Configuration (extends SettingConfig for specialties) ────────────

export interface CategoryConfig {
  slug: string;
  label: string;
  fullLabel: string;
  heroSubtitle: string;
  salaryRange: string;
  keywords: string[];
  faqCategory: string;
  buildWhere: (stateName: string, cityName?: string) => Record<string, unknown>;
  benefits: Array<{
    title: string;
    description: string;
    iconName: string;
  }>;
  tips: string[];
}

// Specialty configs (supplement the setting configs from setting-state-config.ts)
export const SPECIALTY_CONFIGS: Record<string, CategoryConfig> = {
  addiction: {
    slug: 'addiction',
    label: 'Addiction',
    fullLabel: 'Addiction PMHNP',
    heroSubtitle: 'Substance abuse & addiction treatment positions',
    salaryRange: '$120K-180K',
    keywords: ['addiction pmhnp', 'substance abuse pmhnp', 'MAT pmhnp', 'suboxone pmhnp'],
    faqCategory: 'substance-abuse',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('addiction'),
    }),
    benefits: [
      { title: 'High Demand', description: 'Addiction specialists are critically needed — over 40 million Americans have a substance use disorder.', iconName: 'Activity' },
      { title: 'Loan Repayment', description: 'Many addiction positions qualify for NHSC loan repayment up to $50,000+ for serving underserved areas.', iconName: 'DollarSign' },
      { title: 'Meaningful Impact', description: 'Help patients reclaim their lives through evidence-based medication-assisted treatment (MAT).', iconName: 'Heart' },
    ],
    tips: [
      'Get DEA X-waiver for buprenorphine prescribing',
      'Build motivational interviewing skills',
      'Understand MAT protocols (Suboxone, Vivitrol)',
      'Stay current on state opioid prescribing laws',
      'Consider dual diagnosis (addiction + mental health) training',
    ],
  },
  'child-adolescent': {
    slug: 'child-adolescent',
    label: 'Child & Adolescent',
    fullLabel: 'Child & Adolescent PMHNP',
    heroSubtitle: 'Pediatric & youth psychiatric positions',
    salaryRange: '$125K-185K',
    keywords: ['child pmhnp', 'adolescent pmhnp', 'pediatric psychiatric NP', 'youth mental health'],
    faqCategory: 'child-adolescent',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('child-adolescent'),
    }),
    benefits: [
      { title: 'Critical Need', description: 'Youth mental health crisis means massive demand — 1 in 5 children has a diagnosable mental disorder.', iconName: 'Users' },
      { title: 'School-Based Options', description: 'School-based positions follow the academic calendar with summers off and competitive benefits.', iconName: 'Building2' },
      { title: 'Early Intervention Impact', description: 'Shape lifelong outcomes through early identification and treatment of childhood psychiatric conditions.', iconName: 'Heart' },
    ],
    tips: [
      'Get experience with ADHD, anxiety, and ASD in children',
      'Build family engagement and parent coaching skills',
      'Understand pediatric psychopharmacology dosing',
      'Consider school-based positions for work-life balance',
      'Stay current on youth suicide prevention protocols',
    ],
  },
  'substance-abuse': {
    slug: 'substance-abuse',
    label: 'Substance Abuse',
    fullLabel: 'Substance Abuse PMHNP',
    heroSubtitle: 'Substance use disorder treatment positions',
    salaryRange: '$120K-180K',
    keywords: ['substance abuse pmhnp', 'SUD pmhnp', 'detox pmhnp', 'rehab pmhnp'],
    faqCategory: 'substance-abuse',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('substance-abuse'),
    }),
    benefits: [
      { title: 'Growing Field', description: 'Federal funding for addiction treatment has increased dramatically, creating new positions nationwide.', iconName: 'TrendingUp' },
      { title: 'Diverse Settings', description: 'Work in detox centers, residential rehab, outpatient clinics, or integrated primary care settings.', iconName: 'Building2' },
      { title: 'Loan Forgiveness', description: 'Many SUD treatment positions qualify for Public Service Loan Forgiveness and NHSC programs.', iconName: 'DollarSign' },
    ],
    tips: [
      'Build expertise in motivational interviewing',
      'Understand dual diagnosis treatment approaches',
      'Get certified in addiction nursing (CARN)',
      'Stay current on harm reduction models',
      'Learn to work with peer recovery specialists',
    ],
  },
  'new-grad': {
    slug: 'new-grad',
    label: 'New Grad',
    fullLabel: 'New Graduate PMHNP',
    heroSubtitle: 'Entry-level & new graduate positions',
    salaryRange: '$115K-160K',
    keywords: ['new grad pmhnp', 'entry level pmhnp', 'new graduate pmhnp', 'pmhnp fellowship'],
    faqCategory: 'new-grad',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('new-grad'),
    }),
    benefits: [
      { title: 'Mentorship', description: 'Many new grad positions include structured mentorship and supervision from experienced psychiatrists.', iconName: 'Users' },
      { title: 'High Demand', description: 'PMHNP shortage means even new graduates are highly sought after with strong starting salaries.', iconName: 'TrendingUp' },
      { title: 'Career Foundation', description: 'Build clinical confidence and skills that set you up for advanced roles or private practice later.', iconName: 'Shield' },
    ],
    tips: [
      'Prioritize positions with structured supervision',
      'Start with manageable caseloads (8-12 patients/day)',
      'Seek collaborative practice opportunities',
      'Join AANP and ISPN for networking and CE',
      'Negotiate sign-on bonuses and student loan assistance',
    ],
  },
  'per-diem': {
    slug: 'per-diem',
    label: 'Per Diem',
    fullLabel: 'Per Diem PMHNP',
    heroSubtitle: 'PRN & flexible schedule positions',
    salaryRange: '$80-150/hr',
    keywords: ['per diem pmhnp', 'PRN pmhnp', 'part time pmhnp', 'flexible pmhnp'],
    faqCategory: 'per-diem',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('per-diem'),
    }),
    benefits: [
      { title: 'Maximum Flexibility', description: 'Set your own schedule — work as many or as few shifts as you want, when you want.', iconName: 'Activity' },
      { title: 'Higher Hourly Rate', description: 'Per diem roles pay $80-$150+/hr, often 20-40% more than the hourly equivalent of full-time work.', iconName: 'DollarSign' },
      { title: 'Income Supplement', description: 'Perfect for supplementing a full-time position or private practice while maintaining clinical variety.', iconName: 'TrendingUp' },
    ],
    tips: [
      'Maintain your own malpractice insurance',
      'Track hours carefully for tax purposes',
      'Build relationships at multiple facilities',
      'Negotiate competitive hourly rates',
      'Consider 1099 vs W-2 per diem arrangements',
    ],
  },
};

// Job Type configs
export const JOB_TYPE_CONFIGS: Record<string, CategoryConfig> = {
  'full-time': {
    slug: 'full-time',
    label: 'Full-Time',
    fullLabel: 'Full-Time PMHNP',
    heroSubtitle: 'Permanent full-time psychiatric NP positions with benefits',
    salaryRange: '$120K-190K',
    keywords: ['full time pmhnp', 'permanent pmhnp', 'salaried pmhnp'],
    faqCategory: 'remote', // Use remote FAQ as closest match
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('full-time'),
    }),
    benefits: [
      { title: 'Comprehensive Benefits', description: 'Full health insurance, dental, vision, retirement plans, and PTO — typically 20-30 days off.', iconName: 'Heart' },
      { title: 'Job Security', description: 'Stable employment with consistent income, malpractice coverage, and professional development support.', iconName: 'Shield' },
      { title: 'Career Growth', description: 'Access to leadership tracks, CME funding ($2,000-$5,000/year), and promotion opportunities.', iconName: 'TrendingUp' },
    ],
    tips: [
      'Negotiate sign-on bonuses (often $10K-$25K)',
      'Ask about panel size — aim for 14-18 patients/day',
      'Clarify on-call requirements before accepting',
      'Review non-compete clauses carefully',
      'Confirm CME budget and time-off allowance',
    ],
  },
  'part-time': {
    slug: 'part-time',
    label: 'Part-Time',
    fullLabel: 'Part-Time PMHNP',
    heroSubtitle: 'Flexible part-time psychiatric NP positions',
    salaryRange: '$55-95/hr',
    keywords: ['part time pmhnp', 'half time pmhnp', 'flexible pmhnp'],
    faqCategory: 'per-diem',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('part-time'),
    }),
    benefits: [
      { title: 'Work-Life Balance', description: 'Set your own schedule — work 2-3 days per week while maintaining clinical skills and income.', iconName: 'Activity' },
      { title: 'Multiple Income Streams', description: 'Combine part-time with private practice, telehealth, or consulting for maximum earning.', iconName: 'DollarSign' },
      { title: 'Reduced Burnout', description: 'Lower caseloads and schedule flexibility help prevent the burnout epidemic in mental health.', iconName: 'Heart' },
    ],
    tips: [
      'Clarify whether benefits (health, dental) are included',
      'Negotiate pro-rated PTO and CME days',
      'Check if you can set your preferred schedule',
      'Ask about potential to convert to full-time later',
      'Maintain your own malpractice tail coverage',
    ],
  },
  contract: {
    slug: 'contract',
    label: 'Contract',
    fullLabel: 'Contract PMHNP',
    heroSubtitle: 'Contract & locum tenens psychiatric NP assignments',
    salaryRange: '$85-160/hr',
    keywords: ['contract pmhnp', 'locum tenens pmhnp', '1099 pmhnp', 'temp pmhnp'],
    faqCategory: 'travel',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('contract'),
    }),
    benefits: [
      { title: 'Premium Pay', description: 'Contract rates are typically 30-60% higher than permanent positions — $85-$160+/hour.', iconName: 'DollarSign' },
      { title: 'Tax Advantages', description: '1099 contractors can deduct travel, housing, CME, malpractice insurance, and home office expenses.', iconName: 'TrendingUp' },
      { title: 'Geographic Freedom', description: 'Try different cities, practice settings, and patient populations before committing long-term.', iconName: 'MapPin' },
    ],
    tips: [
      'Work with reputable staffing agencies (AMN, CompHealth)',
      'Negotiate housing/travel stipends in your contract',
      'Get your own occurrence-based malpractice policy',
      'Set aside 25-30% for self-employment taxes',
      'Ensure contract specifies patient volume expectations',
    ],
  },
};

// Experience Level configs
export const EXPERIENCE_LEVEL_CONFIGS: Record<string, CategoryConfig> = {
  'entry-level': {
    slug: 'entry-level',
    label: 'Entry-Level',
    fullLabel: 'Entry-Level PMHNP',
    heroSubtitle: 'New graduate & early-career psychiatric NP positions with mentorship',
    salaryRange: '$105K-145K',
    keywords: ['entry level pmhnp', 'new grad pmhnp', 'junior pmhnp', '0-2 years pmhnp'],
    faqCategory: 'new-grad',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('entry-level'),
    }),
    benefits: [
      { title: 'Structured Mentorship', description: 'Most entry-level positions include 6-12 months of supervised practice with experienced psychiatrists or PMHNPs.', iconName: 'Users' },
      { title: 'Competitive Starting Pay', description: 'PMHNP shortage means entry-level pay starts at $105K-$145K — higher than most other NP specialties.', iconName: 'DollarSign' },
      { title: 'Career Launchpad', description: 'Build your clinical foundation with manageable caseloads (8-12 patients/day) before scaling up.', iconName: 'TrendingUp' },
    ],
    tips: [
      'Prioritize positions offering structured supervision',
      'Start with collaborative practice models when possible',
      'Negotiate sign-on bonuses ($5K-$15K common for new grads)',
      'Ask about ramp-up period and initial caseload expectations',
      'Join ISPN or AANP for networking and CE opportunities',
    ],
  },
  'mid-career': {
    slug: 'mid-career',
    label: 'Mid-Career',
    fullLabel: 'Mid-Career PMHNP',
    heroSubtitle: 'Experienced PMHNP positions for 3-7 years of practice',
    salaryRange: '$135K-175K',
    keywords: ['experienced pmhnp', 'mid career pmhnp', '3-5 years pmhnp', 'senior pmhnp positions'],
    faqCategory: 'remote',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('mid-career'),
    }),
    benefits: [
      { title: 'Higher Compensation', description: 'Mid-career PMHNPs earn $135K-$175K with premium benefits, CME budgets, and leadership bonuses.', iconName: 'DollarSign' },
      { title: 'Autonomy & Flexibility', description: 'With proven experience, choose between independent practice, hybrid schedules, or specialized roles.', iconName: 'Activity' },
      { title: 'Specialization Options', description: 'Pivot into addiction medicine, child/adolescent, forensic psych, or private practice consulting.', iconName: 'Shield' },
    ],
    tips: [
      'Leverage experience for higher base salary (benchmark $150K+)',
      'Negotiate productivity bonuses or profit-sharing',
      'Consider adding niche certifications (CARN, BCBA, forensic)',
      'Explore leadership tracks (clinical director, program manager)',
      'Build your referral network for future private practice',
    ],
  },
  senior: {
    slug: 'senior',
    label: 'Senior',
    fullLabel: 'Senior PMHNP',
    heroSubtitle: 'Leadership & advanced practice positions for 7+ years experience',
    salaryRange: '$160K-220K+',
    keywords: ['senior pmhnp', 'lead pmhnp', 'director pmhnp', 'advanced practice pmhnp'],
    faqCategory: 'remote',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('senior'),
    }),
    benefits: [
      { title: 'Top-Tier Compensation', description: 'Senior PMHNPs earn $160K-$220K+ with equity, executive benefits, and performance bonuses.', iconName: 'DollarSign' },
      { title: 'Leadership Impact', description: 'Shape clinical programs, mentor junior providers, and influence organizational mental health strategy.', iconName: 'Users' },
      { title: 'Private Practice Ready', description: 'Your reputation and network support a thriving independent or group practice transition.', iconName: 'TrendingUp' },
    ],
    tips: [
      'Target clinical director or VP-level roles ($180K-$220K+)',
      'Negotiate equity or partnership opportunities',
      'Consider building your own private practice or telehealth group',
      'Pursue board certification in subspecialties for premium positioning',
      'Mentor the next generation — it builds your network and reputation',
    ],
  },
};

// Employer Type configs
export const EMPLOYER_TYPE_CONFIGS: Record<string, CategoryConfig> = {
  hospital: {
    slug: 'hospital',
    label: 'Hospital',
    fullLabel: 'Hospital PMHNP',
    heroSubtitle: 'Hospital-based psychiatric NP positions with full benefits',
    salaryRange: '$125K-180K',
    keywords: ['hospital pmhnp', 'inpatient hospital pmhnp', 'academic medical center pmhnp'],
    faqCategory: 'inpatient',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('hospital'),
    }),
    benefits: [
      { title: 'Full Benefits Package', description: 'Health/dental/vision, pension or 403(b) match, malpractice coverage, CME funding, and tuition reimbursement.', iconName: 'Heart' },
      { title: 'Multidisciplinary Teams', description: 'Collaborate with psychiatrists, social workers, and residents in a structured care environment.', iconName: 'Users' },
      { title: 'Career Advancement', description: 'Clear promotion tracks from staff PMHNP to clinical lead, program director, or department head.', iconName: 'TrendingUp' },
    ],
    tips: [
      'Large systems (HCA, Kaiser, Ascension) offer the best benefits',
      'Academic medical centers often include teaching opportunities',
      'Ask about call schedules — hospital roles may require weekend coverage',
      'Negotiate CME days (5-10 per year is standard for hospital systems)',
      'Union hospitals may offer higher base pay and better protections',
    ],
  },
  'private-practice': {
    slug: 'private-practice',
    label: 'Private Practice',
    fullLabel: 'Private Practice PMHNP',
    heroSubtitle: 'Independent & group practice psychiatric NP opportunities',
    salaryRange: '$140K-250K+',
    keywords: ['private practice pmhnp', 'independent pmhnp', 'group practice pmhnp', 'own practice pmhnp'],
    faqCategory: 'outpatient',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('private-practice'),
    }),
    benefits: [
      { title: 'Highest Earning Potential', description: 'Private practice PMHNPs can earn $200K-$250K+ with autonomy over fee schedules and patient volume.', iconName: 'DollarSign' },
      { title: 'Schedule Control', description: 'Set your own hours, choose your patient mix, and build a practice that fits your lifestyle.', iconName: 'Activity' },
      { title: 'Clinical Autonomy', description: 'Full control over treatment plans, medication management, and therapy integration without corporate protocols.', iconName: 'Shield' },
    ],
    tips: [
      'Full practice authority states are ideal for independent practice',
      'Start by joining an established group before going solo',
      'Build a panel of 300-500 patients for sustainable income',
      'Invest in EHR (SimplePractice, TherapyNotes) and billing software',
      'Get credentialed with major insurers before launching',
    ],
  },
  'community-health': {
    slug: 'community-health',
    label: 'Community Health',
    fullLabel: 'Community Health PMHNP',
    heroSubtitle: 'FQHC, community mental health & public health positions',
    salaryRange: '$110K-160K',
    keywords: ['community health pmhnp', 'FQHC pmhnp', 'community mental health pmhnp', 'public health pmhnp'],
    faqCategory: 'outpatient',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('community-health'),
    }),
    benefits: [
      { title: 'Loan Repayment', description: 'NHSC loan repayment up to $50K for 2 years of service at qualifying FQHCs and underserved sites.', iconName: 'DollarSign' },
      { title: 'Mission-Driven Work', description: 'Serve underserved populations and make a direct impact on community mental health outcomes.', iconName: 'Heart' },
      { title: 'Diverse Experience', description: 'Treat a wide range of conditions across all ages, building broad clinical expertise quickly.', iconName: 'Activity' },
    ],
    tips: [
      'Check NHSC loan repayment eligibility for your site (hpsa.hrsa.gov)',
      'FQHCs provide malpractice coverage under FTCA — a major benefit',
      'Expect higher patient volumes (16-22/day) but broader scope',
      'Bilingual skills are highly valued and may qualify for pay differentials',
      'Community health experience is excellent for future leadership roles',
    ],
  },
  va: {
    slug: 'va',
    label: 'VA',
    fullLabel: 'VA PMHNP',
    heroSubtitle: 'Veterans Affairs psychiatric NP positions with federal benefits',
    salaryRange: '$120K-170K',
    keywords: ['VA pmhnp', 'veterans affairs pmhnp', 'military pmhnp', 'federal pmhnp'],
    faqCategory: 'inpatient',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('va'),
    }),
    benefits: [
      { title: 'Federal Benefits', description: 'Federal pension (FERS), TSP retirement matching, FEHB health insurance, and 26 days PTO starting.', iconName: 'Shield' },
      { title: 'Full Practice Authority', description: 'VA grants PMHNPs full practice authority nationwide regardless of state laws — prescribe independently.', iconName: 'Heart' },
      { title: 'Student Loan Repayment', description: 'EDRP offers up to $200K in student loan repayment for qualifying VA positions.', iconName: 'DollarSign' },
    ],
    tips: [
      'VA applications go through USAJobs.gov — create your profile early',
      'Apply under Direct Hire Authority for faster processing',
      'PTSD and TBI experience is highly valued at VA facilities',
      'Federal pay is based on GS/GP scales — negotiate within the grade',
      'VA offers some of the best work-life balance in healthcare',
    ],
  },
};

// Population Specialty configs
export const POPULATION_SPECIALTY_CONFIGS: Record<string, CategoryConfig> = {
  geriatric: {
    slug: 'geriatric',
    label: 'Geriatric',
    fullLabel: 'Geriatric PMHNP',
    heroSubtitle: 'Older adult & geriatric psychiatric NP positions',
    salaryRange: '$125K-180K',
    keywords: ['geriatric pmhnp', 'geropsych pmhnp', 'elderly psychiatric NP', 'older adult mental health'],
    faqCategory: 'inpatient',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('geriatric'),
    }),
    benefits: [
      { title: 'Growing Demand', description: '10,000 baby boomers turn 65 daily — geriatric psych is one of the fastest-growing PMHNP niches.', iconName: 'TrendingUp' },
      { title: 'Meaningful Care', description: 'Help older adults maintain independence and quality of life through expert psychiatric medication management.', iconName: 'Heart' },
      { title: 'Diverse Settings', description: 'Work in SNFs, memory care units, home health, outpatient clinics, or consultation-liaison services.', iconName: 'Building2' },
    ],
    tips: [
      'Get certified in geropsychiatry for premium positioning',
      'Understand polypharmacy risks and Beers Criteria medications',
      'Learn dementia assessment tools (MoCA, MMSE, GDS)',
      'Build relationships with geriatricians for collaborative care',
      'SNF consultant roles can pay $150-$200/hour',
    ],
  },
  veterans: {
    slug: 'veterans',
    label: 'Veterans',
    fullLabel: 'Veterans Mental Health PMHNP',
    heroSubtitle: 'Military & veteran-focused psychiatric NP positions',
    salaryRange: '$120K-175K',
    keywords: ['veterans pmhnp', 'military mental health pmhnp', 'PTSD pmhnp', 'combat veteran psychiatric NP'],
    faqCategory: 'inpatient',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('veterans'),
    }),
    benefits: [
      { title: 'Critical Mission', description: '22 veterans die by suicide daily — veteran-focused PMHNPs directly save lives through expert care.', iconName: 'Heart' },
      { title: 'Specialized Training', description: 'Access to VA-funded CPT, PE, and EMDR training — gold-standard trauma therapies at no cost.', iconName: 'Shield' },
      { title: 'Federal Benefits', description: 'VA positions include federal pension, TSP matching, 26+ days PTO, and up to $200K loan repayment.', iconName: 'DollarSign' },
    ],
    tips: [
      'PTSD and TBI expertise is the most in-demand skill set',
      'Get trained in CPT (Cognitive Processing Therapy) and PE (Prolonged Exposure)',
      'Military-connected clinicians are especially valued',
      'Community-based veteran organizations also hire PMHNPs',
      'Tri-care network providers serve military families outside VA system',
    ],
  },
  lgbtq: {
    slug: 'lgbtq',
    label: 'LGBTQ+',
    fullLabel: 'LGBTQ+ Affirming PMHNP',
    heroSubtitle: 'LGBTQ+ affirming psychiatric NP positions',
    salaryRange: '$120K-175K',
    keywords: ['lgbtq pmhnp', 'gender affirming pmhnp', 'transgender mental health', 'queer affirming psychiatric NP'],
    faqCategory: 'outpatient',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('lgbtq'),
    }),
    benefits: [
      { title: 'Underserved Niche', description: 'LGBTQ+ individuals face 2.5× higher rates of mental health conditions — trained providers are critically needed.', iconName: 'Heart' },
      { title: 'Growing Demand', description: 'Gender-affirming care is expanding rapidly with new clinics and telehealth platforms specifically serving the community.', iconName: 'TrendingUp' },
      { title: 'Meaningful Impact', description: 'Help reduce health disparities by providing culturally competent psychiatric care to marginalized populations.', iconName: 'Users' },
    ],
    tips: [
      'Complete WPATH SOC training for gender-affirming care fundamentals',
      'Understand hormone therapy interactions with psychiatric medications',
      'Build cultural competency through LGBTQ+ affirming practice workshops',
      'Fenway Health and Callen-Lorde are model programs to study',
      'Telehealth expands reach to LGBTQ+ patients in underserved areas',
    ],
  },
  crisis: {
    slug: 'crisis',
    label: 'Crisis',
    fullLabel: 'Crisis PMHNP',
    heroSubtitle: 'Psychiatric emergency & crisis intervention positions',
    salaryRange: '$130K-195K',
    keywords: ['crisis pmhnp', 'psychiatric emergency pmhnp', '988 suicide hotline pmhnp', 'crisis intervention NP'],
    faqCategory: 'inpatient',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('crisis'),
    }),
    benefits: [
      { title: 'Premium Compensation', description: 'Crisis roles pay 15-30% more than standard positions — $130K-$195K with shift differentials for nights/weekends.', iconName: 'DollarSign' },
      { title: 'High-Impact Work', description: 'Stabilize patients in their most vulnerable moments — every shift makes a life-or-death difference.', iconName: 'Heart' },
      { title: 'Funded by 988', description: 'The 988 Suicide & Crisis Lifeline expansion is creating thousands of new positions with dedicated federal funding.', iconName: 'TrendingUp' },
    ],
    tips: [
      'Get CPI (Crisis Prevention Institute) certification',
      'Learn de-escalation techniques and safety protocols',
      'Expect 12-hour shifts — negotiate 3 days on, 4 days off schedules',
      'Build rapid assessment skills (risk stratification, disposition)',
      'Crisis stabilization centers are the fastest-growing employer type',
    ],
  },
};

// Merge setting configs with city-aware buildWhere
function settingToCategory(config: SettingConfig): CategoryConfig {
  return {
    ...config,
    buildWhere: (stateName: string, cityName?: string) => {
      const base = config.buildWhere(stateName);
      if (cityName) {
        return { ...base, city: { equals: cityName, mode: 'insensitive' } };
      }
      return base;
    },
  };
}

export const ALL_CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  // Settings (5)
  remote: settingToCategory(SETTING_CONFIGS.remote),
  telehealth: settingToCategory(SETTING_CONFIGS.telehealth),
  inpatient: settingToCategory(SETTING_CONFIGS.inpatient),
  outpatient: settingToCategory(SETTING_CONFIGS.outpatient),
  travel: settingToCategory(SETTING_CONFIGS.travel),
  // Specialties (5)
  ...SPECIALTY_CONFIGS,
  // Job Types (3)
  ...JOB_TYPE_CONFIGS,
  // Experience Levels (3)
  ...EXPERIENCE_LEVEL_CONFIGS,
  // Employer Types (4)
  ...EMPLOYER_TYPE_CONFIGS,
  // Population Specialties (4)
  ...POPULATION_SPECIALTY_CONFIGS,
  // ─── Additional Categories (4) ─────────────────────────────────────────────
  '1099': {
    slug: '1099',
    label: '1099',
    fullLabel: '1099 / Independent Contractor PMHNP',
    heroSubtitle: 'Independent contractor & 1099 psychiatric NP positions',
    salaryRange: '$75-150/hr',
    keywords: ['1099 pmhnp', 'independent contractor pmhnp', '1099 psychiatric nurse practitioner', 'contract psych NP'],
    faqCategory: 'outpatient',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('1099'),
    }),
    benefits: [
      { title: 'Higher Gross Pay', description: '1099 PMHNPs earn $75-$150+/hr — 20-40% higher than W2 rates with significant tax deduction opportunities.', iconName: 'DollarSign' },
      { title: 'Schedule Control', description: 'Set your own hours, work with multiple clients, and control your patient volume and caseload.', iconName: 'Clock' },
      { title: 'Tax Advantages', description: 'Deduct business expenses, contribute $66K/year to SEP-IRA, and write off home office and mileage.', iconName: 'DollarSign' },
    ],
    tips: [
      'Form an LLC or PLLC before signing your first contract',
      'Get individual malpractice insurance ($1.5-3K/year)',
      'Set up quarterly estimated tax payments with the IRS',
      'Open a SEP-IRA or Solo 401k for retirement savings',
      'Keep detailed records of all business expenses for deductions',
    ],
  },
  'behavioral-health': {
    slug: 'behavioral-health',
    label: 'Behavioral Health',
    fullLabel: 'Behavioral Health PMHNP',
    heroSubtitle: 'Behavioral health facility & integrated care positions',
    salaryRange: '$120K-180K',
    keywords: ['behavioral health pmhnp', 'behavioral health NP', 'integrated behavioral health', 'mental health facility NP'],
    faqCategory: 'outpatient',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('behavioral-health'),
    }),
    benefits: [
      { title: 'Integrated Care', description: 'Work in multidisciplinary teams combining psychiatric care with therapy, social work, and primary care.', iconName: 'Users' },
      { title: 'Diverse Settings', description: 'Practice in outpatient clinics, residential treatment, partial hospitalization, or intensive outpatient programs.', iconName: 'Building2' },
      { title: 'Growing Sector', description: 'Behavioral health investment has surged — new facilities and telehealth platforms are expanding rapidly.', iconName: 'TrendingUp' },
    ],
    tips: [
      'Integrated behavioral health models are the fastest-growing employer type',
      'Experience with co-occurring disorders (mental health + substance use) is highly valued',
      'PHPs and IOPs offer structured environments with predictable schedules',
      'Many behavioral health companies offer equity or profit-sharing',
      'Get comfortable with brief intervention models for primary care integration',
    ],
  },
  correctional: {
    slug: 'correctional',
    label: 'Correctional',
    fullLabel: 'Correctional PMHNP',
    heroSubtitle: 'Prison, jail & forensic psychiatric NP positions',
    salaryRange: '$130K-190K',
    keywords: ['correctional pmhnp', 'prison pmhnp', 'forensic psychiatric NP', 'jail mental health NP'],
    faqCategory: 'inpatient',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('correctional'),
    }),
    benefits: [
      { title: 'Premium Pay', description: 'Correctional PMHNPs earn $130K-$190K+ due to the challenging environment and high demand for mental health providers.', iconName: 'DollarSign' },
      { title: 'Loan Repayment', description: 'Many correctional facilities qualify for NHSC and state loan repayment programs — up to $50K for 2 years of service.', iconName: 'DollarSign' },
      { title: 'Unique Clinical Skills', description: 'Develop expertise in forensic psychiatry, crisis intervention, and managing complex comorbidities in underserved populations.', iconName: 'Shield' },
    ],
    tips: [
      'CPI (Crisis Prevention Institute) certification is usually required',
      'Expect a structured environment with security protocols',
      'Correctional experience is highly valued for forensic psychiatry careers',
      'Many positions are with staffing companies (Centurion, Wellpath, NaphCare)',
      'Federal BOP (Bureau of Prisons) positions include federal benefits',
    ],
  },
  'locum-tenens': {
    slug: 'locum-tenens',
    label: 'Locum Tenens',
    fullLabel: 'Locum Tenens PMHNP',
    heroSubtitle: 'Temporary assignment & locum tenens psychiatric NP positions',
    salaryRange: '$80-160/hr',
    keywords: ['locum tenens pmhnp', 'locum psych NP', 'temporary assignment pmhnp', 'locum psychiatric nurse practitioner'],
    faqCategory: 'travel',
    buildWhere: (stateName: string, cityName?: string) => ({
      isPublished: true,
      state: { equals: stateName, mode: 'insensitive' },
      ...(cityName && { city: { equals: cityName, mode: 'insensitive' } }),
      ...withTagFallback('locum-tenens'),
    }),
    benefits: [
      { title: 'Highest Hourly Rates', description: 'Locum tenens PMHNPs earn $80-$160/hr — the highest hourly rates in psychiatric nursing with full travel expenses covered.', iconName: 'DollarSign' },
      { title: 'No Long-Term Commitment', description: 'Assignments from 2 weeks to 6+ months. Take breaks between assignments and maintain complete career flexibility.', iconName: 'Calendar' },
      { title: 'Nationwide Opportunities', description: 'Work across multiple states, experience different healthcare systems, and build a diverse clinical portfolio.', iconName: 'MapPin' },
    ],
    tips: [
      'Maintain active licenses in multiple states via compact agreements',
      'Work with 2-3 locum agencies for the best selection of assignments',
      'Negotiate per diem rates, housing, and travel expenses separately',
      'Keep credentialing documents updated and organized digitally',
      'Build relationships for repeat assignments at preferred facilities',
    ],
  },
};

/** All valid category slugs for routing */
export function getAllCategorySlugs(): string[] {
  return Object.keys(ALL_CATEGORY_CONFIGS);
}

// ─── Data Fetching ─────────────────────────────────────────────────────────────

async function getCityJobs(config: CategoryConfig, city: CityData, skip = 0, take = 10) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where = config.buildWhere(city.state, city.name) as any;
    return await prisma.job.findMany({
      where,
      omit: JOB_LISTING_OMIT, // Perf1: don't pull the multi-KB description for cards
      orderBy: [
        { isFeatured: 'desc' },
        { qualityScore: 'desc' },
        { originalPostedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      skip,
      take,
    });
  } catch (error) {
    console.error(`[category-city] Failed to fetch jobs for ${config.slug}/${city.slug}:`, error);
    return [];
  }
}

const EMPTY_STATS = { totalJobs: 0, rawAvgSalary: 0, colAdjustedSalary: 0 };

// Perf2: cache() dedupes the duplicate call within a render (metadata + page
// component both call getCityStats with the same module-level config/city refs).
const getCityStats = cache(async function getCityStats(config: CategoryConfig, city: CityData) {
  try {
    const stats = await prisma.pseoStats.findUnique({
      where: {
        type_categorySlug_locationSlug: {
          type: 'category-city',
          categorySlug: config.slug,
          locationSlug: city.slug,
        }
      }
    });

    if (stats && stats.totalJobs > 0) {
      return {
        totalJobs: stats.totalJobs,
        rawAvgSalary: stats.rawAvgSalary,
        colAdjustedSalary: stats.colAdjustedSalary,
      };
    }
    
    // Fallback: live count when pseoStats cache is empty/stale
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where = config.buildWhere(city.state, city.name) as any;
    const liveCount = await prisma.job.count({ where });
    if (liveCount > 0) {
      // Compute rough avg salary from live data
      const salaryAgg = await prisma.job.aggregate({
        where,
        _avg: { normalizedMaxSalary: true, normalizedMinSalary: true },
      });
      const rawAvg = Math.round(((salaryAgg._avg.normalizedMinSalary ?? 0) + (salaryAgg._avg.normalizedMaxSalary ?? 0)) / 2 / 1000);
      const colAdj = Math.round(rawAvg * (100 / (city.costOfLivingIndex || 100)));
      return { totalJobs: liveCount, rawAvgSalary: rawAvg, colAdjustedSalary: colAdj };
    }

    return EMPTY_STATS;
  } catch (error) {
    console.error(`[category-city] Failed to fetch stats for ${config.slug}/${city.slug}:`, error);
    return EMPTY_STATS;
  }
});

// ─── Market Demand Score ───────────────────────────────────────────────────────

function getMarketDemandScore(city: CityData, totalJobs: number): { score: number; label: string; color: string } {
  let score = 0;

  // Job availability (0-40 points)
  if (totalJobs >= 20) score += 40;
  else if (totalJobs >= 10) score += 30;
  else if (totalJobs >= 5) score += 20;
  else if (totalJobs >= 1) score += 10;

  // MH shortage (0-25 points)
  if (city.mentalHealthShortage) score += 25;
  else if (city.providerRatio === 'low') score += 20;
  else if (city.providerRatio === 'moderate') score += 10;

  // Population (0-20 points)
  if (city.population >= 500000) score += 20;
  else if (city.population >= 100000) score += 15;
  else if (city.population >= 50000) score += 10;
  else score += 5;

  // Healthcare infrastructure (0-15 points)
  if (city.healthcareSystems.length >= 4) score += 15;
  else if (city.healthcareSystems.length >= 2) score += 10;
  else if (city.healthcareSystems.length >= 1) score += 5;

  if (score >= 75) return { score, label: 'Very High', color: '#10b981' };
  if (score >= 55) return { score, label: 'High', color: '#22c55e' };
  if (score >= 35) return { score, label: 'Moderate', color: '#f59e0b' };
  return { score, label: 'Growing', color: '#6b7280' };
}

// ─── Quality Score (for rendering gate) ─────────────────────────────────────
// GSC Fix: Pages with 0 matching jobs ALWAYS return 404.
// Previously, big cities (Tampa, NYC) could pass the ≥25 threshold with 0 jobs
// and render an empty shell → Google flagged as soft 404, wasting crawl budget.
// Now: totalJobs === 0 → hard 404. No exceptions.
// The quality score is still used for noindex gating on pages WITH jobs
// (e.g., a small city with 1 job but no healthcare systems → noindex).

// Minimum jobs threshold for indexing — pages below this are noindex, follow.
// Enterprise standard: thin doorway pages (1-2 jobs) hurt domain quality signals.
const MIN_JOBS_FOR_INDEX = 3;

function getPageQualityScore(city: CityData, totalJobs: number): number {
  if (totalJobs === 0) return 0; // Redirected before reaching here, but belt-and-suspenders

  // Pages with fewer than MIN_JOBS are thin content → noindex but still render
  if (totalJobs < MIN_JOBS_FOR_INDEX) return 10; // Below the 25-point index threshold

  // Tiered scoring based on content density
  let score = 0;

  // Job count tiers
  if (totalJobs >= 10) score += 60;       // Strong content page
  else if (totalJobs >= 5) score += 50;   // Good content page
  else score += 30;                        // Meets minimum (3-4 jobs)

  // City quality signals
  if (city.healthcareSystems.length > 0) score += 15;  // Has named employers
  if (city.metroArea) score += 10;                       // Metro area = higher demand
  if (city.population >= 25000) score += 15;             // Major city
  else if (city.population >= 10000) score += 5;         // Mid-size city
  if (city.mentalHealthShortage) score += 10;            // HPSA designation

  return score; // Pages with score >= 25 get indexed
}

// ─── Metadata Generator ────────────────────────────────────────────────────────

export async function buildCategoryCityMetadata(
  categoryKey: string,
  citySlug: string,
  page: number,
): Promise<Metadata> {
  const config = ALL_CATEGORY_CONFIGS[categoryKey];
  const city = getCityBySlug(citySlug);
  if (!config || !city) return { title: 'Not Found' };

  // getCityStats is already try-catch protected — returns EMPTY_STATS on failure
  const stats = await getCityStats(config, city);

  // SEO: 308 permanent redirect for 0-job pages (metadata phase)
  // The page component also redirects, but this catches the metadata call first
  if (stats.totalJobs === 0) {
    const { permanentRedirect } = await import('next/navigation');
    permanentRedirect(`/jobs/${config.slug}`);
  }

  const basePath = `/jobs/${config.slug}/city/${citySlug}`;

  const qualityScore = getPageQualityScore(city, stats.totalJobs);
  const isHighQuality = qualityScore >= 25;
  const shouldIndex = isHighQuality && page === 1;

  // Canonical consolidation:
  //   • Thin pages (1-2 jobs, score < 25)         → canonical to parent category
  //     so Google consolidates ranking signals upward.
  //   • High-quality page 1                        → self canonical.
  //   • High-quality page N>1 (paginated view)     → canonical to page 1 of the
  //     SAME city (basePath), NOT the parent. Pointing page-2 to the parent
  //     (the prior bug) caused "Duplicate without canonical" in GSC because
  //     Google expects pagination to canonical to the first page of the same
  //     listing, not jump up two levels.
  const canonicalUrl = isHighQuality
    ? `https://pmhnphiring.com${basePath}`
    : `https://pmhnphiring.com/jobs/${config.slug}`;

  // Build salary display for OG image (rawAvgSalary is already in thousands, e.g. 130 = $130K)
  const salaryDisplay = stats.rawAvgSalary && stats.rawAvgSalary > 0
    ? `$${stats.rawAvgSalary}K`
    : '';

  const ogParams = new URLSearchParams({
    category: config.label,
    city: `${city.name}, ${city.stateCode}`,
    jobs: String(stats.totalJobs),
    ...(salaryDisplay && { salary: salaryDisplay }),
    ...(city.mentalHealthShortage && { shortage: 'true' }),
  });

  return {
    title: `${config.label} PMHNP Jobs in ${city.name}, ${city.stateCode} (${stats.totalJobs} Open)`,
    description: `Find ${stats.totalJobs} ${config.label.toLowerCase()} PMHNP jobs in ${city.name}, ${city.stateCode}. ${config.heroSubtitle}. Population: ${city.population.toLocaleString()}. COL index: ${city.costOfLivingIndex}. ${city.mentalHealthShortage ? 'Mental health professional shortage area.' : ''}`,
    keywords: [
      `${config.label.toLowerCase()} pmhnp jobs ${city.name}`,
      `${city.name} ${config.label.toLowerCase()} psychiatric nurse practitioner`,
      `pmhnp jobs ${city.name} ${city.stateCode}`,
    ],
    openGraph: {
      title: `${config.label} PMHNP Jobs in ${city.name}, ${city.stateCode}`,
      description: `Browse ${config.label.toLowerCase()} psychiatric NP positions in ${city.name}. ${config.heroSubtitle}.`,
      type: 'website',
      images: [{
        url: `/api/og/city?${ogParams.toString()}`,
        width: 1200,
        height: 630,
        alt: `${config.label} PMHNP Jobs in ${city.name}, ${city.stateCode}`,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${config.label} PMHNP Jobs in ${city.name}, ${city.stateCode}`,
      images: [`/api/og/city?${ogParams.toString()}`],
    },
    alternates: {
      canonical: canonicalUrl,
    },
    ...(!shouldIndex && {
      robots: { index: false, follow: true },
    }),
  };
}

// ─── Page Component ────────────────────────────────────────────────────────────

interface CategoryCityPageProps {
  categoryKey: string;
  citySlug: string;
  page: number;
}

export default async function CategoryCityPage({ categoryKey, citySlug, page }: CategoryCityPageProps) {
  const config = ALL_CATEGORY_CONFIGS[categoryKey];
  const city = getCityBySlug(citySlug);

  if (!config || !city) {
    const { notFound } = await import('next/navigation');
    notFound();
  }

  const limit = 10;
  const skip = (page - 1) * limit;

  // 1. Instantly fetch pre-calculated stats (single indexed row lookup ~2ms)
  const stats = await getCityStats(config, city!);

  // ═══ SEO GUARD: 308 permanent redirect for 0-job pages ═══
  // Instead of a hard 404 (which wastes crawl budget and loses link equity),
  // 308 redirect to the parent category page so Google consolidates the signal.
  // 308 is the modern equivalent of 301 — tells search engines the move is permanent.
  if (stats.totalJobs === 0) {
    const { permanentRedirect } = await import('next/navigation');
    // Redirect to: /jobs/{category} — the parent enterprise category page
    permanentRedirect(`/jobs/${config.slug}`);
  }

  // ═══ SEO GUARD (S4): hard 404 for thin doorway pages (1-2 jobs) ═══
  // 0 jobs already redirected above. 1-2 jobs render near-identical content
  // across thousands of URLs; meta-robots noindex alone is insufficient because
  // Google still crawls and processes the 200. notFound() removes them from the
  // crawl entirely. Threshold = 3 (shared with the city page, sitemap gate, and
  // seo_threshold_decision.md).
  if (!shouldRenderCategoryCity(stats.totalJobs)) {
    const { notFound: notFoundFn } = await import('next/navigation');
    notFoundFn();
  }

  // 2. Only fetch actual job rows if we know jobs exist
  const jobs = await getCityJobs(config, city!, skip, limit);

  // 404 for paginated pages beyond available results.
  if (page > 1 && jobs.length === 0) {
    const { notFound: notFoundFn } = await import('next/navigation');
    notFoundFn();
  }


  const totalPages = Math.ceil(stats.totalJobs / limit);
  const demand = getMarketDemandScore(city!, stats.totalJobs);
  const basePath = `/jobs/${config.slug}/city/${citySlug}`;

  // Practice authority for this state
  let practiceAuthority: StatePracticeInfo | null = null;
  try {
    practiceAuthority = getStatePracticeAuthority(city!.state);
  } catch {
    // State not found, skip
  }

  // GSC Fix (P1.5): gate cross-links by pseoStats.totalJobs ≥ 1.
  // Empty cross-links generated thousands of "Discovered — currently not
  // indexed" entries. Pseo stats are pre-aggregated, so these queries are fast.
  const allOtherCategoryConfigs = Object.values(ALL_CATEGORY_CONFIGS).filter((c) => c.slug !== config.slug);
  const otherCategoryRows = await prisma.pseoStats.findMany({
    where: {
      type: 'category-city',
      locationSlug: citySlug,
      totalJobs: { gte: 1 },
      categorySlug: { in: allOtherCategoryConfigs.map(c => c.slug) },
    },
    select: { categorySlug: true },
  });
  const validOtherCategorySlugs = new Set(otherCategoryRows.map(r => r.categorySlug));
  const otherCategories = allOtherCategoryConfigs.filter(c => validOtherCategorySlugs.has(c.slug));

  // Get visual assets from the registry for this category
  const assets = CATEGORY_ASSET_REGISTRY[config.slug];

  // Nearby cities — gate by THIS category having ≥1 job in each candidate
  const candidateNearby = city!.nearbyCities
    .map((slug) => getCityBySlug(slug))
    .filter((c): c is CityData => c !== undefined)
    .slice(0, 12); // overshoot, then filter to 6
  const nearbyRows = candidateNearby.length > 0
    ? await prisma.pseoStats.findMany({
        where: {
          type: 'category-city',
          categorySlug: config.slug,
          locationSlug: { in: candidateNearby.map(c => c.slug) },
          totalJobs: { gte: 1 },
        },
        select: { locationSlug: true },
      })
    : [];
  const validNearbySlugs = new Set(nearbyRows.map(r => r.locationSlug));
  const nearbyCities = candidateNearby.filter(c => validNearbySlugs.has(c.slug)).slice(0, 6);

  // P1.5: only render the "{config.label} Jobs in {state}" resource link if a
  // setting-state page actually exists for this taxonomy + state (some
  // taxonomies are city-only and never have a state page; others may have a
  // state page but with 0 jobs right now).
  const cityStateSlug = stateToSlug(city!.state);
  const stateLinkRow = await prisma.pseoStats.findUnique({
    where: {
      type_categorySlug_locationSlug: {
        type: 'setting-state',
        categorySlug: config.slug,
        locationSlug: cityStateSlug,
      },
    },
    select: { totalJobs: true },
  });
  const showStateLink = (stateLinkRow?.totalJobs ?? 0) >= 1;

  // P3.4: per-(taxonomy, city) narrative. DB override wins; otherwise the
  // deterministic builder produces unique-per-(city,taxonomy,jobcount) text.
  // This is the primary defense against GSC "Crawled — currently not indexed"
  // because every cell now has substantively different copy from its peers.
  const dbCatCityOverride = await prisma.categoryCitySnippet.findUnique({
    where: {
      categorySlug_citySlug: {
        categorySlug: config.slug,
        citySlug,
      },
    },
    select: { body: true, approvedAt: true },
  });
  const taxonomyCityNarrative = dbCatCityOverride && dbCatCityOverride.approvedAt
    ? dbCatCityOverride.body
    : buildTaxonomyCityNarrative(buildCityFacts(city!), config.slug, stats.totalJobs);

  /* ═══ Design Tokens — matched to category pages ═══ */
  const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
  };

  return (
    <div style={{ backgroundColor: '#FDFBF7' }}>
      {/* ═══ SCHEMAS ═══ */}
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Jobs', url: 'https://pmhnphiring.com/jobs' },
        { name: config.label, url: `https://pmhnphiring.com/jobs/${config.slug}` },
        { name: city!.state, url: `https://pmhnphiring.com/jobs/${config.slug}/${stateToSlug(city!.state)}` },
        { name: city!.name, url: `https://pmhnphiring.com${basePath}` },
      ]} />
      {/* D9: ItemList schema */}
      {jobs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: `${config.label} PMHNP Jobs in ${city!.name}, ${city!.stateCode}`,
              numberOfItems: stats.totalJobs,
              itemListElement: jobs.slice(0, 10).map((job: Job, idx: number) => ({
                '@type': 'ListItem',
                position: idx + 1,
                name: job.title,
                url: `https://pmhnphiring.com/jobs/${job.slug || job.id}`,
              })),
            }),
          }}
        />
      )}
      {/* D10: Place schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Place',
            name: `${city!.name}, ${city!.stateCode}`,
            address: {
              '@type': 'PostalAddress',
              addressLocality: city!.name,
              addressRegion: city!.stateCode,
              addressCountry: 'US',
            },
          }),
        }}
      />

      {/* ═══ Analytics: pSEO page view tracking ═══ */}
      <PseoPageViewTracker
        pageType="category_city"
        category={config.slug}
        city={city!.name}
        state={city!.stateCode}
        jobCount={stats.totalJobs}
      />

      {/* ═══ D2: HERO — CategoryHero with category's watercolor ═══ */}
      <CategoryHero
        bgColor={assets?.bgColor || '#0D9488'}
        heroImage={assets?.heroImage || 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/hero_wc_remote.webp'}
        heroAlt={`${config.label} PMHNP working in ${city!.name}, ${city!.stateCode}`}
        badgeText={`${stats.totalJobs} live roles · updated today`}
        breadcrumbs={['Careers', config.label, city!.name]}
        headlineLine1={config.label}
        headlineLine2="PMHNP"
        headlineSub={`jobs in ${city!.name}, ${city!.stateCode}.`}
        stats={[
          { value: `${stats.totalJobs}`, label: 'positions' },
          { value: stats.rawAvgSalary > 0 ? `$${stats.rawAvgSalary}k` : config.salaryRange.split('–')[0] || '$130K+', label: 'avg salary' },
          { value: demand.label, label: 'demand' },
        ]}
        description={`${config.label} psychiatric NP positions in ${city!.name}. ${config.heroSubtitle}.`}
        ctaLabel={`Browse ${config.label} Jobs`}
        ctaHref={`/jobs/${config.slug}`}
        secondaryCtaLabel="Set Alert"
        secondaryCtaHref="/job-alerts"
      />

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-7xl mx-auto">

          {/* Job Listings */}
          <div className="grid lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>
                  {config.label} Positions in {city!.name} ({stats.totalJobs})
                </h2>
                <Link
                  href={`/jobs/${config.slug}`}
                  style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textDecoration: 'none' }}
                >
                  View All Jobs →
                </Link>
              </div>

              {jobs.length === 0 ? (
                <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <MapPin className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    No {config.label.toLowerCase()} positions in {city!.name} right now
                  </h3>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    Try browsing nearby cities or statewide listings:
                  </p>
                  {nearbyCities.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 mb-6">
                      {nearbyCities.slice(0, 4).map((nc) => (
                        <Link key={nc.slug} href={`/jobs/${config.slug}/city/${nc.slug}`}
                          className="px-3 py-1.5 text-sm rounded-lg transition-colors hover:opacity-90"
                          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-primary)' }}>
                          {nc.name}, {nc.stateCode}
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link href={`/jobs/${config.slug}/${stateToSlug(city!.state)}`} className="inline-block px-6 py-3 text-white rounded-lg font-medium hover:opacity-90" style={{ backgroundColor: 'var(--color-primary)' }}>
                      {config.label} Jobs in {city!.state}
                    </Link>
                    <Link href={`/jobs/city/${citySlug}`} className="inline-block px-6 py-3 rounded-lg font-medium" style={{ color: 'var(--color-primary)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                      All {city!.name} Jobs
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                    {jobs.map((job: Job) => (
                      <JobCard key={job.id} job={job} />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-4">
                      {page > 1 ? (
                        <Link href={`${basePath}?page=${page - 1}`} className="px-4 py-2 text-sm font-medium rounded-lg" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                          ← Previous
                        </Link>
                      ) : (
                        <span className="px-4 py-2 text-sm rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)' }}>← Previous</span>
                      )}
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
                      {page < totalPages ? (
                        <Link href={`${basePath}?page=${page + 1}`} className="px-4 py-2 text-sm font-medium rounded-lg" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                          Next →
                        </Link>
                      ) : (
                        <span className="px-4 py-2 text-sm rounded-lg cursor-not-allowed" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)' }}>Next →</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              {/* Job Alert CTA */}
              <div className="pseo-bento-card" style={{ ...clayCard, padding: '0', overflow: 'hidden', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
                <div style={{ padding: '24px' }}>
                  <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
                  <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>
                    {config.label} Alerts
                  </h3>
                  <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>
                    New {config.label.toLowerCase()} PMHNP positions in {city!.name} — delivered daily.
                  </p>
                  <Link href="/job-alerts" className="pseo-cta-primary" style={{
                    display: 'block', width: '100%', textAlign: 'center',
                    padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                    background: '#0D9488', color: '#fff', textDecoration: 'none',
                    boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
                  }}>
                    Create Alert
                  </Link>
                </div>
              </div>

              {/* Tips */}
              <div className="pseo-bento-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Lightbulb size={20} style={{ color: '#0D9488' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>{config.label} Tips</h3>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {config.tips.map((tip, i) => (
                    <li key={i} style={{ display: 'flex', gap: '8px', padding: '6px 0', borderBottom: i < config.tips.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none', fontSize: '13px', color: '#5A4A42', lineHeight: 1.5 }}>
                      <span style={{ color: '#0D9488', fontWeight: 700 }}>•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Benefits */}
              <div className="pseo-bento-card" style={{ ...clayCard, padding: '24px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', marginBottom: '16px' }}>Why {config.label}?</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {config.benefits.map((b, i) => (
                    <div key={i}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#1A2E35' }}>{b.title}</div>
                      <p style={{ fontSize: '12px', marginTop: '4px', color: '#5A4A42', lineHeight: 1.5 }}>{b.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ BENTO GRID — "Why Choose [Category]" ═══ */}
          {assets && (
            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '48px 20px 40px' }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
                {assets.bentoSectionLabel}
              </p>
              <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
                {config.label} Careers in {city!.name}
              </h2>
              <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px', lineHeight: 1.6 }}>
                {config.heroSubtitle}
              </p>

              <div className="pseo-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
                {/* ROW 1: Hero card (8col) + Side card (4col) */}
                <div className="pseo-bento-card" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
                  <div style={{ padding: '32px 28px' }}>
                    <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>
                      {`${config.label} in ${city!.name}`}
                    </h3>
                    <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                      {config.heroSubtitle}. {config.tips[0] || ''}
                    </p>
                  </div>
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px' }}>
                    <Image src={assets.bentoImages[0]} alt={`${config.label} PMHNP`} width={280} height={200} sizes="(max-width: 768px) 90vw, 280px" style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
                  </div>
                </div>

                <div className="pseo-bento-card" style={{ ...clayCard, gridColumn: 'span 4', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ flex: '0 0 auto', background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Image src={assets.bentoImages[1]} alt={`${config.label} growth`} width={200} height={140} sizes="(max-width: 768px) 90vw, 200px" style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '10px' }} />
                  </div>
                  <div style={{ padding: '24px 22px', flex: 1 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>
                      Practice Authority
                    </h3>
                    <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                      {practiceAuthority ? `${city!.state} has ${practiceAuthority.authority.toLowerCase()} practice authority for NPs.` : config.tips[1] || `Advance your ${config.label.toLowerCase()} career in ${city!.name}.`}
                    </p>
                  </div>
                </div>

                {/* ROW 2: Icon cards — dynamic count based on benefits */}
                {config.benefits.map((benefit, i) => (
                  <div key={`icon-${i}`} className="pseo-bento-card" style={{ ...clayCard, gridColumn: `span ${Math.floor(12 / config.benefits.length)}`, padding: '24px 18px', textAlign: 'center' }}>
                    {assets.bentoIcons[i] && <Image src={assets.bentoIcons[i]} alt="" width={48} height={48} sizes="48px" style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />}
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>
                      {benefit.title}
                    </h3>
                    <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>
                      {benefit.description}
                    </p>
                  </div>
                ))}

                {/* ROW 3: Salary card (8col) + Alert CTA (4col) */}
                {assets.bentoImages[2] && (
                  <div className="pseo-bento-card" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
                    <div style={{ padding: '32px 28px' }}>
                      <TrendingUp size={28} style={{ color: '#0D9488', marginBottom: '16px' }} />
                      <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Salary & Compensation</h3>
                      <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                        {config.label} PMHNPs in {city!.name} earn {stats.rawAvgSalary > 0 ? `$${stats.rawAvgSalary}k` : config.salaryRange} annually.
                      </p>
                    </div>
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)', padding: '16px' }}>
                      <Image src={assets.bentoImages[2]} alt="Salary growth" width={280} height={200} sizes="(max-width: 768px) 90vw, 280px" style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
                    </div>
                  </div>
                )}

                <div className="pseo-bento-card" style={{ ...clayCard, gridColumn: 'span 4', padding: '28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
                  <Bell size={32} style={{ color: '#0D9488', marginBottom: '14px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#134E4A', margin: '0 0 6px' }}>{config.label} Alerts</h3>
                  <p style={{ fontSize: '13px', color: '#0D9488', margin: '0 0 16px', lineHeight: 1.6, fontWeight: 500 }}>
                    New {config.label.toLowerCase()} listings in {city!.name} — delivered daily.
                  </p>
                  <Link href="/job-alerts" className="pseo-cta-primary" style={{
                    padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                    background: '#0D9488', color: '#fff', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                    boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
                  }}>
                    Create Alert <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ COMMUNITY · MARKET · HEALTHCARE — Full-width warm section ═══ */}
      <section style={{ background: 'linear-gradient(180deg, #FFF8F0 0%, #FDFBF7 100%)', padding: '40px 0', marginTop: '8px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 20px' }}>
          <p className="font-lora" style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '6px' }}>Local Insights</p>
          <h2 className="font-lora" style={{ fontSize: '22px', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '24px' }}>{city!.name} at a Glance</h2>
          {/* `auto-fit, minmax(260px, 1fr)` collapses to a single column on
              375px viewports while preserving the 3-up bento on desktop. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            {/* Community Profile */}
            <div className="pseo-bento-card" style={{ ...clayCard, padding: '24px' }}>
              <h2 className="font-lora" style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <MapPin size={18} style={{ color: '#0D9488' }} /> {city!.name}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#7A6A62' }}>Population</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35' }}>{city!.population.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#7A6A62' }}>Cost of Living</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: city!.costOfLivingIndex > 110 ? '#ef4444' : city!.costOfLivingIndex > 100 ? '#f59e0b' : '#34D399' }}>
                    {city!.costOfLivingIndex}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#7A6A62' }}>Median Income</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35' }}>${(city!.medianIncome / 1000).toFixed(0)}k</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#7A6A62' }}>Shortage</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: city!.mentalHealthShortage ? '#ef4444' : '#34D399' }}>
                    {city!.mentalHealthShortage ? '⚠ Yes' : '✓ No'}
                  </div>
                </div>
              </div>
              {city!.metroArea && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: '12px', color: '#7A6A62' }}>
                  Metro: <strong style={{ color: '#1A2E35' }}>{city!.metroArea}</strong>
                </div>
              )}
            </div>

            {/* Market Insights */}
            <div className="pseo-bento-card" style={{ ...clayCard, padding: '24px' }}>
              <h2 className="font-lora" style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <TrendingUp size={18} style={{ color: '#0D9488' }} /> Market
              </h2>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: '#5A4A42' }}>Demand</span>
                  <span style={{ fontWeight: 700, color: demand.color }}>{demand.label} ({demand.score}/100)</span>
                </div>
                <div style={{ height: '8px', borderRadius: '8px', background: 'rgba(0,0,0,0.05)' }}>
                  <div style={{ height: '8px', borderRadius: '8px', width: `${demand.score}%`, backgroundColor: demand.color, transition: 'width 0.6s ease' }} />
                </div>
              </div>
              {stats.rawAvgSalary > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '11px', color: '#7A6A62' }}>COL-Adjusted Salary</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#1A2E35' }}>
                    ${stats.colAdjustedSalary}k
                    <span style={{ fontSize: '11px', fontWeight: 400, marginLeft: '6px', color: '#7A6A62' }}>(${stats.rawAvgSalary}k nom.)</span>
                  </div>
                </div>
              )}
              {practiceAuthority && (
                <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Shield size={14} style={{ color: '#0D9488' }} />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#1A2E35' }}>{practiceAuthority.authority}</span>
                  </div>
                  <Link href={`/blog/pmhnp-license-${stateToSlug(city!.state)}`} style={{ fontSize: '11px', color: '#0D9488', textDecoration: 'none' }}>
                    {city!.state} Licensure Guide →
                  </Link>
                </div>
              )}
            </div>

            {/* Healthcare Systems */}
            <div className="pseo-bento-card" style={{ ...clayCard, padding: '24px' }}>
              <h2 className="font-lora" style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Building2 size={18} style={{ color: '#0D9488' }} /> Healthcare
              </h2>
              {city!.healthcareSystems.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {city!.healthcareSystems.map((system, i) => (
                    <span key={i} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '8px', background: 'rgba(13,148,136,0.08)', color: '#1A2E35', fontWeight: 500 }}>
                      {system}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0 }}>No major healthcare systems listed for this area.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* D6: Nearby Cities */}
      {nearbyCities.length > 0 && (
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 20px' }}>
          <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', marginBottom: '16px', textAlign: 'center' }}>
            {config.label} PMHNP Jobs in Nearby Cities
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px' }}>
            {nearbyCities.map((nc) => (
              <Link key={nc.slug} href={`/jobs/${config.slug}/city/${nc.slug}`}
                className="pseo-bento-card" style={{ ...clayCard, display: 'block', padding: '14px', textAlign: 'center', textDecoration: 'none' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#1A2E35' }}>{nc.name}</div>
                <div style={{ fontSize: '11px', marginTop: '4px', color: '#7A6A62' }}>{nc.stateCode} · Pop {Math.round(nc.population / 1000)}K</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* D6 + D8: Explore More — Warm bg with clay icon cards */}
      <div style={{ background: 'linear-gradient(180deg, #FFF8F0 0%, #FFF3E8 50%, #FFF8F0 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Keep Exploring
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
            Other PMHNP Job Types in {city!.name}
          </h2>
          <div className="pseo-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            {assets?.exploreCards && assets.exploreCards.length > 0 ? (
              assets.exploreCards.map(c => (
                <Link key={c.href} href={c.href.includes('/city/') ? c.href : `${c.href}/city/${citySlug}`} className="pseo-bento-card" style={{ ...clayCard, padding: '24px 20px', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                  <Image src={c.icon} alt="" width={48} height={48} sizes="48px" style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 12px', display: 'block' }} />
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{c.label}</span>
                  <span style={{ fontSize: '12px', color: '#7A6A62', display: 'block' }}>{c.sub}</span>
                </Link>
              ))
            ) : (
              otherCategories.slice(0, 6).map((cat) => (
                <Link key={cat.slug} href={`/jobs/${cat.slug}/city/${citySlug}`}
                  className="pseo-bento-card" style={{ ...clayCard, padding: '24px 20px', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{cat.label}</span>
                  <span style={{ fontSize: '12px', color: '#7A6A62', display: 'block' }}>in {city!.name}</span>
                </Link>
              ))
            )}
          </div>

          {/* Resource Links */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginTop: '32px' }}>
            <Link href={`/salary-guide/${stateToSlug(city!.state)}`} className="pseo-bento-card" style={{ ...clayCard, padding: '20px', textDecoration: 'none' }}>
              <h3 className="font-lora" style={{ fontSize: '15px', fontWeight: 700, color: '#0D9488', marginBottom: '4px' }}>
                <DollarSign size={16} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> {city!.state} Salary Guide
              </h3>
              <p style={{ fontSize: '12px', color: '#5A4A42', margin: 0 }}>Salary data by setting and experience.</p>
            </Link>
            {showStateLink && (
              <Link href={`/jobs/${config.slug}/${stateToSlug(city!.state)}`} className="pseo-bento-card" style={{ ...clayCard, padding: '20px', textDecoration: 'none' }}>
                <h3 className="font-lora" style={{ fontSize: '15px', fontWeight: 700, color: '#0D9488', marginBottom: '4px' }}>
                  <MapPin size={16} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> {config.label} Jobs in {city!.state}
                </h3>
                <p style={{ fontSize: '12px', color: '#5A4A42', margin: 0 }}>Browse all {config.label.toLowerCase()} positions statewide.</p>
              </Link>
            )}
            <Link href={`/jobs/${config.slug}`} className="pseo-bento-card" style={{ ...clayCard, padding: '20px', textDecoration: 'none' }}>
              <h3 className="font-lora" style={{ fontSize: '15px', fontWeight: 700, color: '#0D9488', marginBottom: '4px' }}>
                <Building2 size={16} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> All {config.label} Jobs
              </h3>
              <p style={{ fontSize: '12px', color: '#5A4A42', margin: 0 }}>Nationwide {config.label.toLowerCase()} positions.</p>
            </Link>
          </div>
        </section>
      </div>

      {/* GEO + FAQ — in its own container wrapper */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* ── P3.4: per-(taxonomy, city) market context ─────────────────────── */}
          {/* Replaces the prior templated "Quick Facts" block. The narrative is
              substantively unique per (city, taxonomy, totalJobs) tuple — the
              fix Google's quality model actually rewards (E-E-A-T-like depth,
              not template substitution). data-speakable preserved for AEO. */}
          <section
            className="pseo-bento-card"
            style={{ ...clayCard, padding: '24px', marginTop: '0' }}
            id="answer-summary"
            data-speakable="true"
          >
            <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', marginBottom: '12px' }}>
              {config.label} PMHNP Market in {city!.name}, {city!.stateCode}
            </h2>
            <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#5A4A42', margin: 0 }}>
              {taxonomyCityNarrative}
            </p>
            <p style={{ fontSize: '11px', marginTop: '8px', color: '#A09080' }}>
              Sources: U.S. Census Bureau, Bureau of Labor Statistics, HRSA HPSA data, AANP State Practice Environment.
            </p>
          </section>

          {/* ── AEO: Frequently Asked Questions with Schema ─────────────────── */}
          {(() => {
            const faqs = [
              {
                q: `How many ${config.label.toLowerCase()} PMHNP jobs are available in ${city!.name}, ${city!.stateCode}?`,
                a: `There ${stats.totalJobs === 1 ? 'is' : 'are'} currently ${stats.totalJobs} ${config.label.toLowerCase()} PMHNP ${stats.totalJobs === 1 ? 'position' : 'positions'} available in ${city!.name}, ${city!.stateCode}. New positions are posted regularly as demand for psychiatric nurse practitioners continues to grow.`,
              },
              {
                q: `What is the average PMHNP salary in ${city!.name}?`,
                a: stats.rawAvgSalary > 0
                  ? `The average ${config.label.toLowerCase()} PMHNP salary in ${city!.name} is approximately $${stats.rawAvgSalary}K per year. Adjusted for the local cost of living (index: ${city!.costOfLivingIndex}), this equates to about $${stats.colAdjustedSalary}K in purchasing power. The typical range for ${config.label.toLowerCase()} positions is ${config.salaryRange}.`
                  : `${config.label} PMHNP positions in ${city!.name} typically pay ${config.salaryRange}. Actual compensation depends on experience, employer type, and whether the role includes benefits. ${city!.name}'s cost of living index is ${city!.costOfLivingIndex} (national average = 100).`,
              },
              {
                q: `Does ${city!.state} allow PMHNPs full practice authority?`,
                a: practiceAuthority ? `${city!.state} has ${practiceAuthority.authority.toLowerCase()} practice authority for nurse practitioners. ${String(practiceAuthority.authority).includes('Full') ? 'PMHNPs can practice independently, prescribe medications, and diagnose without physician oversight.' : String(practiceAuthority.authority).includes('Reduced') ? 'PMHNPs require a collaborative agreement with a physician but can prescribe and diagnose with that arrangement.' : 'PMHNPs must practice under physician supervision for prescribing and some clinical decisions.'}` : `Contact the ${city!.state} Board of Nursing for current practice authority information.`,
              },
              {
                q: `Is ${city!.name} a good place for PMHNP careers?`,
                a: `${city!.name} ${city!.mentalHealthShortage ? 'is designated as a Mental Health Professional Shortage Area (HPSA), meaning there is high demand and often sign-on bonuses, loan repayment programs, and competitive salaries for PMHNPs.' : 'has growing demand for mental health providers.'} With a population of ${city!.population.toLocaleString('en-US')}${city!.metroArea ? ` and part of the ${city!.metroArea} metro area` : ''}, ${city!.name} offers ${city!.healthcareSystems.length > 0 ? `access to major health systems including ${city!.healthcareSystems.join(', ')}` : 'a variety of practice settings'}.`,
              },
              {
                q: `What qualifications do I need for ${config.label.toLowerCase()} PMHNP jobs in ${city!.name}?`,
                a: `To work as a PMHNP in ${city!.name}, ${city!.stateCode}, you need: (1) A Master's or Doctoral degree in psychiatric-mental health nursing, (2) National certification as a PMHNP (ANCC-certified), (3) An active RN and APRN license in ${city!.state}, and (4) DEA registration for prescribing controlled substances. ${config.label === 'Entry-Level' ? 'Many entry-level positions accept new graduates and provide structured mentorship.' : config.label === 'Senior' ? 'Senior positions typically require 7+ years of experience and may require subspecialty certifications.' : `${config.label} positions may have additional requirements specific to the employer and setting.`}`,
              },
            ];
            return (
              <>
                {/* FAQ Schema JSON-LD */}
                <script
                  type="application/ld+json"
                  dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                      '@context': 'https://schema.org',
                      '@type': 'FAQPage',
                      mainEntity: faqs.map(faq => ({
                        '@type': 'Question',
                        name: faq.q,
                        acceptedAnswer: {
                          '@type': 'Answer',
                          text: faq.a,
                        },
                      })),
                    }),
                  }}
                />
                {/* Speakable Schema — marks content sections for voice/AI consumption */}
                <script
                  type="application/ld+json"
                  dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                      '@context': 'https://schema.org',
                      '@type': 'WebPage',
                      name: `${config.label} PMHNP Jobs in ${city!.name}, ${city!.stateCode}`,
                      speakable: {
                        '@type': 'SpeakableSpecification',
                        cssSelector: ['#answer-summary', '.faq-answer'],
                      },
                      url: `https://pmhnphiring.com${basePath}`,
                    }),
                  }}
                />
                {/* Visible FAQ Section — Accordion Style */}
              </>
            );
          })()}
        </div>
      </div>

      {/* FAQ Accordion — Warm bg section matching CategoryFAQ */}
      <div style={{ background: '#FDFBF7' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Common Questions
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
            {config.label} PMHNP Jobs in {city!.name} — FAQ
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(() => {
              const faqs = [
                {
                  q: `How many ${config.label.toLowerCase()} PMHNP jobs are available in ${city!.name}, ${city!.stateCode}?`,
                  a: `There ${stats.totalJobs === 1 ? 'is' : 'are'} currently ${stats.totalJobs} ${config.label.toLowerCase()} PMHNP ${stats.totalJobs === 1 ? 'position' : 'positions'} available in ${city!.name}, ${city!.stateCode}. New positions are posted regularly as demand for psychiatric nurse practitioners continues to grow.`,
                },
                {
                  q: `What is the average PMHNP salary in ${city!.name}?`,
                  a: stats.rawAvgSalary > 0
                    ? `The average ${config.label.toLowerCase()} PMHNP salary in ${city!.name} is approximately $${stats.rawAvgSalary}K per year. Adjusted for the local cost of living (index: ${city!.costOfLivingIndex}), this equates to about $${stats.colAdjustedSalary}K in purchasing power.`
                    : `${config.label} PMHNP positions in ${city!.name} typically pay ${config.salaryRange}. Actual compensation depends on experience, employer type, and whether the role includes benefits.`,
                },
                {
                  q: `Does ${city!.state} allow PMHNPs full practice authority?`,
                  a: practiceAuthority ? `${city!.state} has ${practiceAuthority.authority.toLowerCase()} practice authority for nurse practitioners. ${String(practiceAuthority.authority).includes('Full') ? 'PMHNPs can practice independently without physician oversight.' : String(practiceAuthority.authority).includes('Reduced') ? 'PMHNPs require a collaborative agreement with a physician.' : 'PMHNPs must practice under physician supervision for prescribing and some clinical decisions.'}` : `Contact the ${city!.state} Board of Nursing for current practice authority information.`,
                },
                {
                  q: `Is ${city!.name} a good place for PMHNP careers?`,
                  a: `${city!.name} ${city!.mentalHealthShortage ? 'is designated as a Mental Health Professional Shortage Area (HPSA), meaning there is high demand and often sign-on bonuses and loan repayment programs.' : 'has growing demand for mental health providers.'} With a population of ${city!.population.toLocaleString('en-US')}${city!.metroArea ? ` in the ${city!.metroArea} metro` : ''}, ${city!.name} offers ${city!.healthcareSystems.length > 0 ? `access to major health systems including ${city!.healthcareSystems.slice(0, 3).join(', ')}` : 'a variety of practice settings'}.`,
                },
                {
                  q: `What qualifications do I need for ${config.label.toLowerCase()} PMHNP jobs?`,
                  a: `To work as a PMHNP in ${city!.name}, you need: a Master's or Doctoral degree in psychiatric-mental health nursing, ANCC PMHNP-BC certification, an active RN and APRN license in ${city!.state}, and DEA registration for prescribing controlled substances.`,
                },
              ];
              return faqs.map((faq, i) => (
                <details key={i} className="pseo-faq-item" style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.5)',
                  boxShadow: '4px 4px 12px rgba(0,0,0,0.04), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
                  overflow: 'hidden',
                }} {...(i === 0 ? { open: true } : {})}>
                  <summary style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '20px 24px', cursor: 'pointer', listStyle: 'none',
                    fontSize: '15px', fontWeight: 600, color: '#1A2E35', lineHeight: 1.4,
                  }}>
                    {faq.q}
                  </summary>
                  <div style={{ padding: '0 24px 20px', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                    <p className="faq-answer" style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: '16px 0 0' }}>{faq.a}</p>
                  </div>
                </details>
              ));
            })()}
          </div>
        </section>
      </div>

      {/* D11: Responsive + Hover CSS */}
      <style>{`
        .pseo-cta-primary { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .pseo-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        .pseo-bento-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .pseo-bento-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .pseo-faq-item summary { list-style: none; }
        .pseo-faq-item summary::-webkit-details-marker { display: none; }
        .pseo-faq-item summary::after {
          content: '';
          width: 28px; height: 28px; border-radius: 8px;
          background: #F0FDFA;
          display: inline-flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%230D9488' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: center;
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .pseo-faq-item[open] summary::after {
          background-color: #0D9488;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='18 15 12 9 6 15'%3E%3C/polyline%3E%3C/svg%3E");
          transform: none;
        }
        .pseo-faq-item { transition: box-shadow 0.3s ease; }
        .pseo-faq-item[open] { box-shadow: 6px 6px 20px rgba(0,0,0,0.08), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        /* .pseo-explore-grid uses auto-fit minmax(220px, 1fr) inline so it
           collapses on its own at narrow widths -- no media override needed. */
        .pseo-bento-grid > div { min-width: 0; }
        @media (max-width: 768px) {
          .pseo-bento-grid { grid-template-columns: 1fr !important; }
          .pseo-bento-grid > div { grid-column: span 1 !important; grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
