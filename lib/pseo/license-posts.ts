/**
 * lib/pseo/license-posts.ts — server-only existence check for the per-state
 * licensure blog posts (audit Item 29).
 *
 * content/blog ships exactly 50 pmhnp-license-*.mdx files — one per state,
 * but NONE for district-of-columbia. Practice-authority data covers 50 states
 * + DC, so gating a `/blog/pmhnp-license-{slug}` link on practiceAuthority
 * alone ships a guaranteed-404 link on every DC page. This module reads the
 * blog directory once at module load (fs — do NOT import from a 'use client'
 * component) and exposes hasLicensePost() so link sites render nothing when
 * the post is missing.
 */
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

const LICENSE_POST_PREFIX = 'pmhnp-license-';
const MDX_EXTENSION = '.mdx';
const BLOG_CONTENT_DIR = path.join(process.cwd(), 'content', 'blog');

function loadLicensePostSlugs(): Set<string> {
  try {
    return new Set(
      fs
        .readdirSync(BLOG_CONTENT_DIR)
        .filter((f) => f.startsWith(LICENSE_POST_PREFIX) && f.endsWith(MDX_EXTENSION))
        .map((f) => f.slice(LICENSE_POST_PREFIX.length, -MDX_EXTENSION.length)),
    );
  } catch (error) {
    // Missing/unreadable content dir → suppress every license link rather
    // than crash page renders; log so the empty set is never silent.
    logger.error('[license-posts] Failed to read content/blog; license links disabled:', error);
    return new Set();
  }
}

const LICENSE_POST_STATE_SLUGS = loadLicensePostSlugs();

/** True when content/blog/pmhnp-license-{stateSlug}.mdx exists on disk. */
export function hasLicensePost(stateSlug: string): boolean {
  return LICENSE_POST_STATE_SLUGS.has(stateSlug);
}
