/** Rate limit no cliente (sessionStorage). Complementa limites do Supabase Auth. */

type AuthAction = 'login' | 'reset';

const WINDOW_MS = 15 * 60 * 1000;

const LIMITS: Record<AuthAction, number> = {
  login: 8,
  reset: 3,
};

type Bucket = {
  count: number;
  firstAt: number;
};

function storageKey(action: AuthAction): string {
  return `auth_rl:${action}`;
}

function readBucket(action: AuthAction): Bucket | null {
  try {
    const raw = sessionStorage.getItem(storageKey(action));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Bucket;
    if (!parsed || typeof parsed.count !== 'number' || typeof parsed.firstAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeBucket(action: AuthAction, bucket: Bucket): void {
  try {
    sessionStorage.setItem(storageKey(action), JSON.stringify(bucket));
  } catch {
    /* ignore */
  }
}

function clearBucket(action: AuthAction): void {
  try {
    sessionStorage.removeItem(storageKey(action));
  } catch {
    /* ignore */
  }
}

function minutesLeft(firstAt: number): number {
  const remaining = WINDOW_MS - (Date.now() - firstAt);
  return Math.max(1, Math.ceil(remaining / 60000));
}

export function checkAuthRateLimit(action: AuthAction): { ok: true } | { ok: false; message: string } {
  const bucket = readBucket(action);
  if (!bucket) return { ok: true };

  if (Date.now() - bucket.firstAt > WINDOW_MS) {
    clearBucket(action);
    return { ok: true };
  }

  if (bucket.count >= LIMITS[action]) {
    const mins = minutesLeft(bucket.firstAt);
    const label = action === 'login' ? 'login' : 'redefinicao de senha';
    return {
      ok: false,
      message: `Muitas tentativas de ${label}. Aguarde cerca de ${mins} min e tente novamente.`,
    };
  }

  return { ok: true };
}

export function recordAuthAttempt(action: AuthAction): void {
  const now = Date.now();
  const bucket = readBucket(action);

  if (!bucket || now - bucket.firstAt > WINDOW_MS) {
    writeBucket(action, { count: 1, firstAt: now });
    return;
  }

  writeBucket(action, { count: bucket.count + 1, firstAt: bucket.firstAt });
}

export function clearAuthRateLimit(action: AuthAction): void {
  clearBucket(action);
}
