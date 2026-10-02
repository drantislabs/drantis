import { rateLimit } from '../../../lib/rate-limit';
import { publicError, readSmallJson } from '../../../lib/request';
import { analyzeAuthorizedScenario } from '../../../lib/showcase';

const encoder = new TextEncoder();

// drantis:public
export async function POST(request: Request) {
  const limit = rateLimit(request, 'analyze-stream');
  if (!limit.ok)
    return new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'Retry-After': String(limit.retryAfterSeconds),
      },
    });
  let scenario = '';
  try {
    const body = await readSmallJson<{ scenario?: unknown }>(request);
    scenario = typeof body.scenario === 'string' ? body.scenario : '';
  } catch (error) {
    return new Response(JSON.stringify({ error: publicError(error, 'Invalid request.') }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      try {
        const report = await analyzeAuthorizedScenario(scenario, (event) =>
          send({ type: 'progress', event }),
        );
        send({ type: 'report', report });
      } catch (error) {
        send({ type: 'error', error: publicError(error, 'Analysis failed safely.') });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
