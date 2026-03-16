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
import { Metadata } from 'next';
import {
  TrendingUp, Building2, Bell, MapPin, Lightbulb,
  DollarSign, Users, AlertTriangle, Activity, Heart, Shield,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { Job } from '@/lib/types';
import { CityData } from './city-data/types';
import { getCityBySlug } from './city-data/cities';
import { SETTING_CONFIGS, SettingConfig, stateToSlug } from './setting-state-config';
import {
  getStatePracticeAuthority,
  getAuthorityColor,
  StatePracticeInfo,
  PracticeAuthority,
} from '@/lib/state-practice-authority';

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
      OR: [
        { title: { contains: 'addiction', mode: 'insensitive' } },
        { title: { contains: 'substance', mode: 'insensitive' } },
        { title: { contains: 'MAT', mode: 'insensitive' } },
        { title: { contains: 'suboxone', mode: 'insensitive' } },
        { title: { contains: 'buprenorphine', mode: 'insensitive' } },
        { description: { contains: 'addiction', mode: 'insensitive' } },
        { description: { contains: 'substance abuse', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'child', mode: 'insensitive' } },
        { title: { contains: 'adolescent', mode: 'insensitive' } },
        { title: { contains: 'pediatric', mode: 'insensitive' } },
        { title: { contains: 'youth', mode: 'insensitive' } },
        { description: { contains: 'child and adolescent', mode: 'insensitive' } },
        { description: { contains: 'pediatric psych', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'substance', mode: 'insensitive' } },
        { title: { contains: 'detox', mode: 'insensitive' } },
        { title: { contains: 'rehab', mode: 'insensitive' } },
        { title: { contains: 'recovery', mode: 'insensitive' } },
        { description: { contains: 'substance abuse', mode: 'insensitive' } },
        { description: { contains: 'substance use disorder', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'new grad', mode: 'insensitive' } },
        { title: { contains: 'new graduate', mode: 'insensitive' } },
        { title: { contains: 'entry level', mode: 'insensitive' } },
        { title: { contains: 'fellowship', mode: 'insensitive' } },
        { title: { contains: 'residency', mode: 'insensitive' } },
        { description: { contains: 'new graduate', mode: 'insensitive' } },
        { description: { contains: 'new grad', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'per diem', mode: 'insensitive' } },
        { title: { contains: 'PRN', mode: 'insensitive' } },
        { title: { contains: 'part-time', mode: 'insensitive' } },
        { title: { contains: 'part time', mode: 'insensitive' } },
        { description: { contains: 'per diem', mode: 'insensitive' } },
        { description: { contains: 'PRN', mode: 'insensitive' } },
      ],
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
      OR: [
        { jobType: { equals: 'Full-Time', mode: 'insensitive' } },
        { jobType: { equals: 'Full Time', mode: 'insensitive' } },
        { title: { contains: 'full-time', mode: 'insensitive' } },
        { title: { contains: 'full time', mode: 'insensitive' } },
        { description: { contains: 'full-time position', mode: 'insensitive' } },
      ],
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
      OR: [
        { jobType: { equals: 'Part-Time', mode: 'insensitive' } },
        { jobType: { equals: 'Part Time', mode: 'insensitive' } },
        { title: { contains: 'part-time', mode: 'insensitive' } },
        { title: { contains: 'part time', mode: 'insensitive' } },
        { description: { contains: 'part-time', mode: 'insensitive' } },
      ],
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
      OR: [
        { jobType: { equals: 'Contract', mode: 'insensitive' } },
        { jobType: { equals: 'Locum Tenens', mode: 'insensitive' } },
        { title: { contains: 'contract', mode: 'insensitive' } },
        { title: { contains: 'locum', mode: 'insensitive' } },
        { title: { contains: '1099', mode: 'insensitive' } },
        { description: { contains: 'contract position', mode: 'insensitive' } },
        { description: { contains: 'locum tenens', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'entry level', mode: 'insensitive' } },
        { title: { contains: 'entry-level', mode: 'insensitive' } },
        { title: { contains: 'new grad', mode: 'insensitive' } },
        { title: { contains: 'junior', mode: 'insensitive' } },
        { title: { contains: 'fellowship', mode: 'insensitive' } },
        { description: { contains: 'new graduate', mode: 'insensitive' } },
        { description: { contains: '0-2 years', mode: 'insensitive' } },
        { description: { contains: 'entry level', mode: 'insensitive' } },
      ],
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
      OR: [
        { description: { contains: '3+ years', mode: 'insensitive' } },
        { description: { contains: '3-5 years', mode: 'insensitive' } },
        { description: { contains: '5+ years', mode: 'insensitive' } },
        { description: { contains: 'experienced', mode: 'insensitive' } },
        { description: { contains: 'mid-career', mode: 'insensitive' } },
        { title: { contains: 'experienced', mode: 'insensitive' } },
        { title: { contains: 'senior', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'senior', mode: 'insensitive' } },
        { title: { contains: 'lead', mode: 'insensitive' } },
        { title: { contains: 'director', mode: 'insensitive' } },
        { title: { contains: 'supervisor', mode: 'insensitive' } },
        { title: { contains: 'manager', mode: 'insensitive' } },
        { description: { contains: '7+ years', mode: 'insensitive' } },
        { description: { contains: '10+ years', mode: 'insensitive' } },
        { description: { contains: 'leadership', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'hospital', mode: 'insensitive' } },
        { title: { contains: 'medical center', mode: 'insensitive' } },
        { title: { contains: 'health system', mode: 'insensitive' } },
        { company: { contains: 'hospital', mode: 'insensitive' } },
        { company: { contains: 'medical center', mode: 'insensitive' } },
        { company: { contains: 'health system', mode: 'insensitive' } },
        { description: { contains: 'hospital setting', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'private practice', mode: 'insensitive' } },
        { title: { contains: 'group practice', mode: 'insensitive' } },
        { title: { contains: 'independent', mode: 'insensitive' } },
        { description: { contains: 'private practice', mode: 'insensitive' } },
        { description: { contains: 'group practice', mode: 'insensitive' } },
        { description: { contains: 'solo practice', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'community', mode: 'insensitive' } },
        { title: { contains: 'FQHC', mode: 'insensitive' } },
        { title: { contains: 'public health', mode: 'insensitive' } },
        { title: { contains: 'behavioral health', mode: 'insensitive' } },
        { company: { contains: 'community', mode: 'insensitive' } },
        { description: { contains: 'community mental health', mode: 'insensitive' } },
        { description: { contains: 'federally qualified', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'VA ', mode: 'insensitive' } },
        { title: { contains: 'veteran', mode: 'insensitive' } },
        { title: { contains: 'Veterans Affairs', mode: 'insensitive' } },
        { company: { contains: 'VA ', mode: 'insensitive' } },
        { company: { contains: 'veteran', mode: 'insensitive' } },
        { company: { contains: 'Department of Veterans', mode: 'insensitive' } },
        { description: { contains: 'veterans', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'geriatric', mode: 'insensitive' } },
        { title: { contains: 'geri', mode: 'insensitive' } },
        { title: { contains: 'older adult', mode: 'insensitive' } },
        { title: { contains: 'senior living', mode: 'insensitive' } },
        { description: { contains: 'geriatric', mode: 'insensitive' } },
        { description: { contains: 'older adult', mode: 'insensitive' } },
        { description: { contains: 'geropsych', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'veteran', mode: 'insensitive' } },
        { title: { contains: 'military', mode: 'insensitive' } },
        { title: { contains: 'PTSD', mode: 'insensitive' } },
        { title: { contains: 'VA ', mode: 'insensitive' } },
        { description: { contains: 'veteran', mode: 'insensitive' } },
        { description: { contains: 'military', mode: 'insensitive' } },
        { description: { contains: 'PTSD', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'LGBTQ', mode: 'insensitive' } },
        { title: { contains: 'gender', mode: 'insensitive' } },
        { title: { contains: 'affirming', mode: 'insensitive' } },
        { title: { contains: 'transgender', mode: 'insensitive' } },
        { description: { contains: 'LGBTQ', mode: 'insensitive' } },
        { description: { contains: 'gender affirming', mode: 'insensitive' } },
        { description: { contains: 'transgender', mode: 'insensitive' } },
      ],
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
      OR: [
        { title: { contains: 'crisis', mode: 'insensitive' } },
        { title: { contains: 'emergency', mode: 'insensitive' } },
        { title: { contains: 'acute', mode: 'insensitive' } },
        { title: { contains: 'urgent', mode: 'insensitive' } },
        { title: { contains: '988', mode: 'insensitive' } },
        { description: { contains: 'crisis', mode: 'insensitive' } },
        { description: { contains: 'psychiatric emergency', mode: 'insensitive' } },
      ],
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
};

/** All valid category slugs for routing */
export function getAllCategorySlugs(): string[] {
  return Object.keys(ALL_CATEGORY_CONFIGS);
}

// ─── Data Fetching ─────────────────────────────────────────────────────────────

async function getCityJobs(config: CategoryConfig, city: CityData, skip = 0, take = 10) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = config.buildWhere(city.state, city.name) as any;
  return prisma.job.findMany({
    where,
    orderBy: [
      { isFeatured: 'desc' },
      { qualityScore: 'desc' },
      { originalPostedAt: 'desc' },
      { createdAt: 'desc' },
    ],
    skip,
    take,
  });
}

async function getCityStats(config: CategoryConfig, city: CityData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = config.buildWhere(city.state, city.name) as any;
  
  const totalJobs = await prisma.job.count({ where });
  
  const salaryData = await prisma.job.aggregate({
    where: {
      ...where,
      normalizedMinSalary: { not: null },
      normalizedMaxSalary: { not: null },
    },
    _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
  });

  const rawAvg = Math.round(
    ((salaryData._avg.normalizedMinSalary || 0) + (salaryData._avg.normalizedMaxSalary || 0)) / 2 / 1000
  );

  // Cost-of-living adjusted salary
  const colAdjustedSalary = rawAvg > 0
    ? Math.round(rawAvg * (100 / city.costOfLivingIndex))
    : 0;

  return { totalJobs, rawAvgSalary: rawAvg, colAdjustedSalary };
}

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

// ─── Quality Score (for noindex gating) ────────────────────────────────────────
// Pages need score ≥ 25 to be indexed. This ensures pages with at least
// 2 enrichment signals (e.g., population ≥25K + healthcare systems) are indexed.
// Any page with ≥1 matching job automatically gets +50 → always indexed.

function getPageQualityScore(city: CityData, totalJobs: number): number {
  let score = 0;
  if (totalJobs > 0) score += 50;         // Job match = always indexed
  if (city.healthcareSystems.length > 0) score += 15;
  if (city.metroArea) score += 10;
  if (city.population >= 25000) score += 15;
  if (city.population >= 10000) score += 5; // All cities in dataset pass this
  if (city.mentalHealthShortage) score += 10;
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

  const stats = await getCityStats(config, city);
  const basePath = `/jobs/${config.slug}/city/${citySlug}`;

  const shouldIndex = getPageQualityScore(city, stats.totalJobs) >= 25 && page === 1;

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
    },
    alternates: {
      canonical: `https://pmhnphiring.com${basePath}`,
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

  const [jobs, stats] = await Promise.all([
    getCityJobs(config, city!, skip, limit),
    getCityStats(config, city!),
  ]);

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

  // Other categories for cross-linking
  const otherCategories = Object.values(ALL_CATEGORY_CONFIGS).filter((c) => c.slug !== config.slug).slice(0, 4);

  // Nearby cities
  const nearbyCities = city!.nearbyCities
    .map((slug) => getCityBySlug(slug))
    .filter((c): c is CityData => c !== undefined)
    .slice(0, 6);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Jobs', url: 'https://pmhnphiring.com/jobs' },
        { name: config.label, url: `https://pmhnphiring.com/jobs/${config.slug}` },
        { name: city!.state, url: `https://pmhnphiring.com/jobs/${config.slug}/${stateToSlug(city!.state)}` },
        { name: city!.name, url: `https://pmhnphiring.com${basePath}` },
      ]} />

      {/* Hero */}
      <section className="bg-teal-600 text-white py-10 md:py-14">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3">
              {config.label} PMHNP Jobs in {city!.name}, {city!.stateCode}
            </h1>
            <p className="text-sm text-teal-200 mb-4">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} |{' '}
              {city!.metroArea ? `${city!.metroArea} Metro` : `${city!.state}`}
            </p>
            <p className="text-lg text-teal-100 mb-6">
              {stats.totalJobs > 0
                ? `Discover ${stats.totalJobs} ${config.label.toLowerCase()} psychiatric NP positions in ${city!.name}`
                : `${config.label} PMHNP opportunities in ${city!.name} — new positions posted regularly`}
            </p>

            {/* Stats Bar */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-6">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-teal-100">Open Positions</div>
              </div>
              {stats.rawAvgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.rawAvgSalary}k</div>
                  <div className="text-sm text-teal-100">Avg. Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold">{city!.population >= 1000000 ? `${(city!.population / 1000000).toFixed(1)}M` : `${Math.round(city!.population / 1000)}K`}</div>
                <div className="text-sm text-teal-100">Population</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold" style={{ color: demand.color }}>{demand.label}</div>
                <div className="text-sm text-teal-100">Market Demand</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-7xl mx-auto">

          {/* Community Profile + Market Insights */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Community Profile */}
            <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                📍 {city!.name} Community Profile
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Population</div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{city!.population.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Cost of Living</div>
                  <div className="text-lg font-semibold" style={{ color: city!.costOfLivingIndex > 110 ? '#ef4444' : city!.costOfLivingIndex > 100 ? '#f59e0b' : '#10b981' }}>
                    {city!.costOfLivingIndex} <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>(US avg: 100)</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Median Income</div>
                  <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>${(city!.medianIncome / 1000).toFixed(0)}k</div>
                </div>
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Provider Shortage</div>
                  <div className="text-lg font-semibold" style={{ color: city!.mentalHealthShortage ? '#ef4444' : '#10b981' }}>
                    {city!.mentalHealthShortage ? '⚠ Yes' : '✓ Adequate'}
                  </div>
                </div>
              </div>
              {city!.metroArea && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Metro Area</div>
                  <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{city!.metroArea}</div>
                </div>
              )}
            </div>

            {/* Market Insights */}
            <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                📊 {config.label} Market Insights
              </h2>
              {/* Demand Score Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span style={{ color: 'var(--text-secondary)' }}>Market Demand</span>
                  <span className="font-semibold" style={{ color: demand.color }}>{demand.label} ({demand.score}/100)</span>
                </div>
                <div className="h-3 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <div className="h-3 rounded-full transition-all" style={{ width: `${demand.score}%`, backgroundColor: demand.color }} />
                </div>
              </div>

              {stats.rawAvgSalary > 0 && stats.colAdjustedSalary > 0 && (
                <div className="mb-4">
                  <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>COL-Adjusted Salary</div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    ${stats.colAdjustedSalary}k
                    <span className="text-sm font-normal ml-2" style={{ color: 'var(--text-tertiary)' }}>
                      (nominal: ${stats.rawAvgSalary}k)
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Adjusted for {city!.name}&apos;s cost of living index ({city!.costOfLivingIndex})
                  </p>
                </div>
              )}

              {practiceAuthority && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{city!.state} Practice Authority</span>
                  </div>
                  <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${(() => { const c = getAuthorityColor(practiceAuthority.authority); return `${c.bg} ${c.text} ${c.border}`; })()}`}>
                    {practiceAuthority.description}
                  </span>
                  <Link href={`/blog/pmhnp-license-${stateToSlug(city!.state)}`} className="block mt-2 text-xs" style={{ color: 'var(--color-primary)' }}>
                    View {city!.state} Licensure Guide →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Healthcare Systems */}
          {city!.healthcareSystems.length > 0 && (
            <div className="rounded-xl p-6 mb-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                🏥 Major Healthcare Systems in {city!.name}
              </h2>
              <div className="flex flex-wrap gap-2">
                {city!.healthcareSystems.map((system, i) => (
                  <span key={i} className="px-3 py-1.5 text-sm rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                    {system}
                  </span>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
                These healthcare systems frequently hire {config.label.toLowerCase()} PMHNPs in the {city!.name} area.
              </p>
            </div>
          )}

          {/* Job Listings */}
          <div className="grid lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {config.label} Positions in {city!.name} ({stats.totalJobs})
                </h2>
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
              <div className="bg-teal-600 rounded-xl p-6 text-white mb-6 shadow-lg">
                <Bell className="h-8 w-8 mb-3" />
                <h3 className="text-lg font-bold mb-2">Get Job Alerts</h3>
                <p className="text-sm text-teal-100 mb-4">
                  New {config.label.toLowerCase()} PMHNP positions in {city!.name} — delivered to your inbox.
                </p>
                <Link href="/job-alerts" className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors">
                  Create Alert
                </Link>
              </div>

              {/* Tips */}
              <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>{config.label} Tips</h3>
                </div>
                <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {config.tips.map((tip, i) => (
                    <li key={i} className="flex gap-2">
                      <span style={{ color: 'var(--color-primary)' }} className="font-bold">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Benefits */}
              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h3 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Why {config.label}?</h3>
                <div className="space-y-4">
                  {config.benefits.map((b, i) => (
                    <div key={i}>
                      <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{b.title}</div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{b.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Nearby Cities */}
          {nearbyCities.length > 0 && (
            <div className="mt-12 rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                {config.label} PMHNP Jobs in Nearby Cities
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {nearbyCities.map((nc) => (
                  <Link key={nc.slug} href={`/jobs/${config.slug}/city/${nc.slug}`}
                    className="block p-3 rounded-lg text-center hover:shadow-md transition-all"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                    <div className="font-semibold text-sm">{nc.name}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{nc.stateCode} · Pop {Math.round(nc.population / 1000)}K</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Other Categories in this city */}
          <div className="mt-8 rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Other PMHNP Job Types in {city!.name}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {otherCategories.map((cat) => (
                <Link key={cat.slug} href={`/jobs/${cat.slug}/city/${citySlug}`}
                  className="block p-3 rounded-lg text-center hover:shadow-md transition-all"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                  <div className="font-semibold text-sm">{cat.label}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>in {city!.name}</div>
                </Link>
              ))}
              <Link href={`/jobs/city/${citySlug}`}
                className="block p-3 rounded-lg text-center hover:shadow-md transition-all"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                <div className="font-semibold text-sm">All Jobs</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>in {city!.name}</div>
              </Link>
            </div>
          </div>

          {/* Resource Links */}
          <div className="mt-8 pt-8" style={{ borderTop: '1px solid var(--border-color)' }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href={`/salary-guide/${stateToSlug(city!.state)}`} className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>💰 {city!.state} Salary Guide</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Salary data by setting and experience.</p>
              </Link>
              <Link href={`/jobs/${config.slug}/${stateToSlug(city!.state)}`} className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>📍 {config.label} Jobs in {city!.state}</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Browse all {config.label.toLowerCase()} positions statewide.</p>
              </Link>
              <Link href={`/jobs/${config.slug}`} className="block p-4 rounded-lg hover:shadow-sm transition-all" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h3 className="font-semibold" style={{ color: 'var(--color-primary)' }}>🏥 All {config.label} Jobs</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Nationwide {config.label.toLowerCase()} positions.</p>
              </Link>
            </div>
          </div>

          {/* ── GEO: AI-Quotable Answer Paragraph ─────────────────────────────── */}
          <section className="mt-10 rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }} id="answer-summary" data-speakable="true">
            <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              {config.label} PMHNP Jobs in {city!.name}: Quick Facts
            </h2>
            <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              As of {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}, there {stats.totalJobs === 1 ? 'is' : 'are'}{' '}
              <strong>{stats.totalJobs} {config.label.toLowerCase()} PMHNP {stats.totalJobs === 1 ? 'position' : 'positions'}</strong> available
              in {city!.name}, {city!.stateCode}.
              {stats.rawAvgSalary > 0 && <> The average salary for these positions is <strong>${stats.rawAvgSalary}K per year</strong>{city!.costOfLivingIndex !== 100 ? `, which is approximately $${stats.colAdjustedSalary}K when adjusted for ${city!.name}'s cost of living index (${city!.costOfLivingIndex})` : ''}.</>}
              {' '}{city!.name} has a population of {city!.population.toLocaleString('en-US')} and
              {city!.mentalHealthShortage ? ' is designated as a Mental Health Professional Shortage Area (HPSA), indicating high demand for psychiatric providers.' : ' has growing demand for mental health services.'}
              {practiceAuthority && <>{' '}{city!.state} is a <strong>{practiceAuthority.authority}</strong> practice authority state for nurse practitioners.</>}
              {config.salaryRange && <> The typical salary range for {config.label.toLowerCase()} roles is <strong>{config.salaryRange}</strong>.</>}
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Sources: U.S. Census Bureau, Bureau of Labor Statistics, HRSA HPSA data. Updated {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
            </p>
          </section>

          {/* ── AEO: Frequently Asked Questions with Schema ─────────────────── */}
          {(() => {
            const faqs = [
              {
                q: `How many ${config.label.toLowerCase()} PMHNP jobs are available in ${city!.name}, ${city!.stateCode}?`,
                a: `As of ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}, there ${stats.totalJobs === 1 ? 'is' : 'are'} ${stats.totalJobs} ${config.label.toLowerCase()} PMHNP ${stats.totalJobs === 1 ? 'position' : 'positions'} available in ${city!.name}, ${city!.stateCode}. New positions are posted regularly as demand for psychiatric nurse practitioners continues to grow.`,
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
                {/* Visible FAQ Section */}
                <section className="mt-10 rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                    Frequently Asked Questions: {config.label} PMHNP Jobs in {city!.name}
                  </h2>
                  <div className="space-y-6">
                    {faqs.map((faq, i) => (
                      <div key={i} className="pb-5" style={{ borderBottom: i < faqs.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                        <h3 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>
                          {faq.q}
                        </h3>
                        <p className="faq-answer text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          {faq.a}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
