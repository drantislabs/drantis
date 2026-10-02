const windows = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const LIMIT = 20;
const MAX_BUCKETS = 5_000;

function configuredClientIdentity(request: Request): string {
  const configuredHeader = (process.env.DRANTIS_CLIENT_IP_HEADER ?? process.env.LAUNCHPROOF_CLIENT_IP_HEADER)?.trim().toLowerCase();
  if (!configuredHeader) return 'anonymous';
  const raw = request.headers.get(configuredHeader)?.split(',')[0]?.trim() ?? '';
  return /^[a-zA-Z0-9:._-]{1,128}$/.test(raw) ? raw : 'anonymous';
}

function prune(now: number): void {
  for (const [key, value] of windows) if (value.resetAt <= now) windows.delete(key);
  if (windows.size <= MAX_BUCKETS) return;
  for (const key of windows.keys()) {
    windows.delete(key);
    if (windows.size <= MAX_BUCKETS) break;
  }
}

export function rateLimit(
  request: Request,
  scope: string,
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  if (windows.size >= MAX_BUCKETS) prune(now);
  const client = configuredClientIdentity(request);
  const key = `${scope}:${client}`;
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  if (current.count > LIMIT)
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  return { ok: true, retryAfterSeconds: 0 };
}
