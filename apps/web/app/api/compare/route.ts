import { NextResponse } from 'next/server';
import { compareReports } from '@launchproof/core';
import { rateLimit } from '../../../lib/rate-limit';
import { publicError } from '../../../lib/request';
import { analyzeAuthorizedScenario } from '../../../lib/showcase';

// drantis:public
export async function POST(request: Request) {
  const limit = rateLimit(request, 'compare');
  if (!limit.ok)
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  try {
    const [before, after] = await Promise.all([
      analyzeAuthorizedScenario('production-reference'),
      analyzeAuthorizedScenario('missing-tenant-authorization'),
    ]);
    return NextResponse.json(
      { before, after, comparison: compareReports(before, after) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: publicError(error, 'Comparison failed safely.') },
      { status: 500 },
    );
  }
}
