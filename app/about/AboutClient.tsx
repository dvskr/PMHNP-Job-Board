'use client';
import Link from 'next/link';
import './about.css';
import { Briefcase, Users, MapPin, RefreshCw, CheckCircle, DollarSign, CalendarDays, Target, BarChart3, Layers, Shield, ArrowRight, Play } from 'lucide-react';
import { brand } from '@/config/brand';

export default function AboutClient({ totalJobs, totalEmployers }: { totalJobs: number; totalEmployers: number }) {
  return (
    <div className="ab-body">
      {/* ═══ HERO ═══ */}
      <section className="ab-hero">
        <div className="ab-wrap" style={{ textAlign: 'center' }}>
          <div className="ab-eyebrow"><span className="pulse" /> Dedicated Infrastructure · Est. 2026</div>
          <div className="ab-hero-head">
            <h1>We&apos;re shaping the <em>future</em><br />of <span className="clay-underline">PMHNP</span> careers.</h1>
            <p className="ab-hero-sub" style={{ textAlign: 'center' }}>The only job platform built exclusively for Psychiatric Mental Health Nurse Practitioners. No generic noise — just roles that match your scope.</p>
            <div className="ab-hero-cta">
              <Link href="/jobs" className="ab-btn ab-btn-primary">Browse open roles <ArrowRight size={16} /></Link>
              <Link href="/resources" className="ab-btn ab-btn-ghost">All Resources</Link>
            </div>
          </div>

          {/* CLAY DIORAMA */}
          <div className="ab-clay-stage">
            <div className="ab-diorama">
              <div className="ab-scene" style={{ minHeight: 320, background: 'linear-gradient(160deg, #D6E8DE, #B5D1C3)', padding: 0 }}>
                <img src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/about/diorama_new_grad.webp" alt="New Grad residency" style={{ width: '100%', flex: 1, objectFit: 'cover', borderRadius: '28px 28px 0 0' }} />
                <div style={{ padding: '16px 20px' }}><div className="label">Residency<br />matches</div><div className="meta" style={{ marginTop: 10 }}>320 cohorts</div></div>
              </div>
              <div className="ab-scene teal" style={{ minHeight: 380, padding: 0 }}>
                <img src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/about/diorama_inpatient.webp" alt="Inpatient psychiatric" style={{ width: '100%', flex: 1, objectFit: 'cover', borderRadius: '28px 28px 0 0' }} />
                <div style={{ padding: '16px 20px' }}><div className="label">Acute<br />psychiatric units</div><div className="meta" style={{ marginTop: 10 }}>1,240 roles</div></div>
              </div>
              <div className="ab-scene coral" style={{ minHeight: 350, padding: 0 }}>
                <img src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/about/diorama_telehealth.webp" alt="Telehealth remote practice" style={{ width: '100%', flex: 1, objectFit: 'cover', borderRadius: '28px 28px 0 0' }} />
                <div style={{ padding: '16px 20px' }}><div className="label">Remote<br />practice</div><div className="meta" style={{ marginTop: 10 }}>2,105 listings</div></div>
              </div>
              <div className="ab-scene" style={{ minHeight: 310, background: 'linear-gradient(160deg, #F3D7A8, #E3BC7B)', padding: 0 }}>
                <img src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/about/diorama_outpatient.webp" alt="Outpatient community clinics" style={{ width: '100%', flex: 1, objectFit: 'cover', borderRadius: '28px 28px 0 0' }} />
                <div style={{ padding: '16px 20px' }}><div className="label">Community<br />clinics</div><div className="meta" style={{ marginTop: 10 }}>885 openings</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      <section><div className="ab-wrap">
        <div className="ab-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="ab-stat"><div className="ico"><Briefcase size={24} /></div><div className="num">{totalJobs.toLocaleString()}<em>+</em></div><div className="lab">Active Jobs</div></div>
          <div className="ab-stat"><div className="ico"><Users size={24} /></div><div className="num">{totalEmployers.toLocaleString()}</div><div className="lab">Verified Employers</div></div>
          <div className="ab-stat"><div className="ico"><MapPin size={24} /></div><div className="num">50</div><div className="lab">States Covered</div></div>
        </div>
      </div></section>

      {/* ═══ FOR PMHNPs ═══ */}
      <section className="ab-pad"><div className="ab-wrap">
        <div className="ab-two-col">
          <div>
            <span className="ab-kicker"><Target size={12} /> For PMHNPs</span>
            <h2 style={{ marginTop: 20 }}>Stop scrolling past generic <em>RN postings.</em></h2>
            <p style={{ marginTop: 22, color: 'var(--ink-soft)', fontSize: 18, maxWidth: 540 }}>General nursing boards bury psychiatric NP roles under thousands of primary-care postings. This site only lists psychiatric mental health NP jobs — filtered by setting, salary, license, and the actual scope of practice you train in.</p>
            <div className="ab-feat-list">
              <div className="ab-feat"><div className="ab-feat-ico"><CheckCircle size={22} /></div><div><h4>100% Specialized Filters</h4><p>Search by psychiatric setting — Inpatient, Outpatient, Telehealth, Correctional, Addiction, Geriatric — instead of typical nursing tags.</p></div></div>
              <div className="ab-feat"><div className="ab-feat-ico coral"><DollarSign size={22} /></div><div><h4>Unmatched Salary Transparency</h4><p>We pierce the veil on compensation, comparing state benchmarks with thousands of real-time listings so you can negotiate fairly.</p></div></div>
              <div className="ab-feat"><div className="ab-feat-ico" style={{ color: '#6F63C0' }}><CalendarDays size={22} /></div><div><h4>Licensure-aware Alerts</h4><p>Your compact and state licensure drive the feed — you only ever see roles you can actually accept.</p></div></div>
            </div>
            <Link href="/sign-up" className="ab-btn ab-btn-primary" style={{ marginTop: 36 }}>Create a free profile <ArrowRight size={16} /></Link>
          </div>
          <div>
            <div className="ab-diorama-card mint" style={{ padding: 0 }}>
              <img src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/about/diorama_candidates.webp" alt="Career growth for PMHNPs" style={{ width: '100%', flex: 1, objectFit: 'cover', borderRadius: '40px 40px 0 0' }} />
              <div style={{ padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontFamily: "var(--font-lora), 'Lora', serif", fontSize: 18 }}>Chart your path, step by step.</b>
                <span className="chip">PMHNP · 2026</span>
              </div>
            </div>
          </div>
        </div>
      </div></section>

      {/* ═══ FOR EMPLOYERS ═══ */}
      <section className="ab-pad ab-emp-section"><div className="ab-wrap">
        <div className="ab-two-col flip">
          <div>
            <div className="ab-diorama-card peach" style={{ padding: 0 }}>
              <img src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/about/diorama_employers.webp" alt="Employer hiring dashboard" style={{ width: '100%', flex: 1, objectFit: 'cover', borderRadius: '40px 40px 0 0' }} />
              <div style={{ padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontFamily: "var(--font-lora), 'Lora', serif", fontSize: 18 }}>A team room, not a newsstand.</b>
                <span className="chip">Dashboard</span>
              </div>
            </div>
          </div>
          <div>
            <span className="ab-kicker coral"><ArrowRight size={12} /> For Employers</span>
            <h2 style={{ marginTop: 20 }}>Zero-waste <em>candidate sourcing.</em></h2>
            <p style={{ marginTop: 22, color: 'var(--ink-soft)', fontSize: 18, maxWidth: 540 }}>Skip generic aggregators where most applicants are unqualified. Post directly to a board where every visitor is a practicing or about-to-practice PMHNP.</p>
            <div className="ab-feat-list">
              <div className="ab-feat"><div className="ab-feat-ico coral"><Target size={22} /></div><div><h4>High-Intent Audience</h4><p>The talent on PMHNP Hiring is actively surveying psychiatric scopes — not casually browsing — leading to vastly higher conversion rates.</p></div></div>
              <div className="ab-feat"><div className="ab-feat-ico" style={{ color: '#6F63C0' }}><BarChart3 size={22} /></div><div><h4>Analytics & Placements</h4><p>Secure featured placements and monitor actionable apply-funnel analytics directly from your verified employer dashboard.</p></div></div>
              <div className="ab-feat"><div className="ab-feat-ico"><Layers size={22} /></div><div><h4>Calibrated Matching</h4><p>Our taxonomy maps exact subspecialties — SMI, C/L, substance use, perinatal — so you spend less time filtering and more time hiring.</p></div></div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap' }}>
              <Link href="/employers" className="ab-btn ab-btn-primary">Post a role</Link>
              <button className="ab-btn ab-btn-ghost">Download employer deck</button>
            </div>
          </div>
        </div>
      </div></section>

      {/* ═══ METHODOLOGY ═══ */}
      <section className="ab-pad"><div className="ab-wrap">
        <div className="ab-method-head">
          <span className="ab-kicker lav"><Layers size={12} /> Our methodology</span>
          <h2 style={{ marginTop: 20 }}>Hard data. <em>No assumptions.</em></h2>
          <p>Accuracy isn&apos;t optional. Our methodology relies on rigorous real-time scraping, algorithmic parity, and editorial audits across multiple authoritative healthcare indexes.</p>
        </div>
        <div className="ab-method-grid">
          <div className="ab-method-card featured"><span className="num-tag">01</span><div className="mi"><Layers size={28} /></div><h3>Multi-Vector Aggregation</h3><p>We synthesize endpoints from the Bureau of Labor Statistics, native ATS feeds, and direct employer postings into a single streamlined view.</p></div>
          <div className="ab-method-card"><span className="num-tag">02</span><div className="mi" style={{ color: 'var(--coral)' }}><Shield size={28} /></div><h3>Editorial Integrity</h3><p>Parsing agents rigorously fact-check listings against state nursing boards. We never inflate salaries to artificially increase clicks.</p></div>
          <div className="ab-method-card"><span className="num-tag">03</span><div className="mi" style={{ color: '#6F63C0' }}><RefreshCw size={28} /></div><h3>Continuous Sync</h3><p>Stale listings are useless. Our system automatically purges expired opportunities and fetches exact market data on a strict 24-hour cycle.</p></div>
        </div>
      </div></section>

      {/* ═══ FOUNDER ═══ */}
      {/* SEO Fix H10/H14: replaced "S.K." mark and "Kumar" surname with the
          founder's full legal name (already in Organization JSON-LD). Copy
          rewritten in plain English, dropping LLM-tells like "uncompromised
          ecosystem", "hyper-calibrated marketplace", "fractured ecosystem". */}
      <section className="ab-pad" style={{ paddingTop: 40 }}><div className="ab-wrap">
        <div className="ab-founder">
          <div className="ab-portrait"><div className="bust" /><div className="tag-flo">Founder · Software Engineer</div></div>
          <div className="ab-founder-body">
            <span className="ab-kicker"><Users size={12} /> Who built this</span>
            <h2 style={{ marginTop: 20 }}>One person, one focused job board.</h2>
            <p>I built PMHNP Hiring because every general nursing job site I looked at made psychiatric NPs do the same thing over and over: filter out hundreds of unrelated RN postings just to find the handful of psych roles. There was no good reason for that, so I built something focused on one specialty instead.</p>
            <p>I&apos;m a software engineer, not a clinician. My job here is the data pipeline — pulling job postings, normalizing salary fields, mapping state licensure rules, and surfacing the result through a fast, ad-light interface. The clinical content on this site is editorial commentary aggregated from public sources, not medical advice.</p>
            <p>If something on the site is wrong, missing, or could be better, the fastest way to reach me is the <Link href="/contact" style={{ color: 'inherit', textDecoration: 'underline' }}>contact page</Link>.</p>
            <div className="ab-sig">
              <div className="ab-sig-mark">P</div>
              <div>
                <div className="name">{brand.legal.founderName}</div>
                <div className="role">Founder · {brand.legal.entityName}</div>
              </div>
            </div>
            <p style={{ marginTop: 28, fontSize: 13, color: 'var(--ink-soft, #6B7F8A)', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 18 }}>
              {brand.name} is a service operated by <strong>{brand.legal.entityName}</strong>, a {brand.legal.jurisdiction.split(',')[0]} limited liability company headquartered at {brand.legal.address}.
            </p>
          </div>
        </div>
      </div></section>

      {/* ═══ TESTIMONIALS ═══ */}
      {/* SEO Fix H11: testimonials section removed. The previous quotes named
          "Maya R., PMHNP-BC", "Daniel O., DNP, PMHNP", and "Dr. Priya M."
          with no last names, no LinkedIn links, and stylized avatars — they
          read as fabricated, which is a direct E-E-A-T trust hit. Restore
          this section ONLY when real quotes can be attributed to named users
          who have explicitly opted in. */}

      {/* ═══ CTA ═══ */}
      <section className="ab-pad" style={{ paddingTop: 40 }}><div className="ab-wrap">
        <div className="ab-cta-card">
          <div>
            <span className="ab-kicker coral" style={{ background: 'rgba(255,255,255,0.28)', color: '#fff', boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(170,80,55,0.2)' }}><CheckCircle size={12} /> Ready when you are</span>
            <h2 style={{ marginTop: 20 }}>Initialize <em>your search.</em></h2>
            <p>Deploy a job alert tuned to your licensure and scope, or open a direct conduit with our team to talk through a role you&apos;ve had your eye on.</p>
            <form className="ab-cta-form" onSubmit={(e) => e.preventDefault()}>
              <input type="email" placeholder="you@practice.com" />
              <button className="ab-btn ab-btn-dark" type="submit">Send me alerts</button>
            </form>
            <p style={{ marginTop: 18, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Or <Link href="/jobs" style={{ textDecoration: 'underline' }}>browse 5,000+ open roles</Link> · no sign-up required.</p>
          </div>
          <div className="ab-cta-visual"><div className="circle-big" /></div>
        </div>
      </div></section>
    </div>
  );
}
