import { NextResponse } from 'next/server';
import { rateLimit } from '../../../lib/rate-limit';
import { publicError, readSmallJson } from '../../../lib/request';
import { analyzeAuthorizedScenario } from '../../../lib/showcase';

// drantis:public
export async function POST(request: Request) {
  const limit = rateLimit(request, 'analyze');
  if (!limit.ok)
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  try {
    const body = await readSmallJson<{ scenario?: unknown }>(request);
    const scenario = typeof body.scenario === 'string' ? body.scenario : '';
    const report = await analyzeAuthorizedScenario(scenario);
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    const message = publicError(error, 'Analysis failed safely.');
    const status = /not authorized|Invalid authorized|Request body/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
