import { NextResponse } from 'next/server';

/**
 * Verify upgrade session — DEPRECATED in single-tier pricing model.
 * Kept as a route to avoid 404s if old links are hit.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Upgrades are no longer available. All job posts include the same features.' },
    { status: 410 }
  );
}
