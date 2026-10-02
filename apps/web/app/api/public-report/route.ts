import { NextResponse } from 'next/server';
import { rateLimit } from '../../../lib/rate-limit';
import { publicError } from '../../../lib/request';
import { publicScenarioReport, SHOWCASE_TARGETS } from '../../../lib/showcase';

// drantis:public
export async function GET(request: Request) {
  const limit = rateLimit(request, 'public-report');
  if (!limit.ok)
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  const scenario = new URL(request.url).searchParams.get('scenario') ?? '';
  if (!SHOWCASE_TARGETS.has(scenario))
    return NextResponse.json({ error: 'Scenario is not authorized.' }, { status: 400 });
  try {
    return NextResponse.json(await publicScenarioReport(scenario), {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicError(error, 'Report failed safely.') },
      { status: 500 },
    );
  }
}
