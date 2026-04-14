import { NextResponse } from 'next/server';

/**
 * Upgrade checkout — DEPRECATED in single-tier pricing model.
 * All posts get the same features. No tiers to upgrade between.
 * Kept as a route to avoid 404s if old links are hit.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Upgrades are no longer available. All job posts include the same features.' },
    { status: 410 }
  );
}
