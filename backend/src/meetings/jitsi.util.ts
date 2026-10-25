import { createHmac } from 'crypto';

/** Minimal HS256 JWT for optional Jitsi token auth (no extra deps). */
export function signHs256Jwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSec = 6 * 3600,
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, nbf: now - 10, exp: now + expiresInSec };
  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64url')
      .replace(/=+$/, '');
  const data = `${enc(header)}.${enc(body)}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url').replace(/=+$/, '');
  return `${data}.${sig}`;
}

export function jitsiEnabled() {
  return !!(process.env.JITSI_PUBLIC_URL || '').trim();
}

export function jitsiPublicUrl() {
  return (process.env.JITSI_PUBLIC_URL || '').trim().replace(/\/$/, '');
}

export function roomNameForMeeting(meetingId: number) {
  return `pmo${meetingId}${Date.now().toString(36).slice(-4)}`;
}

export function buildJitsiJoinUrl(room: string, displayName: string, jwt?: string) {
  const base = jitsiPublicUrl();
  const safeName = displayName.replace(/["\\]/g, '').slice(0, 80) || 'User';
  const hash = `userInfo.displayName="${safeName}"`;
  const q = jwt ? `?jwt=${encodeURIComponent(jwt)}` : '';
  return `${base}/${room}${q}#${hash}`;
}

export function buildJitsiJwt(opts: {
  room: string;
  userId: number;
  name: string;
  email?: string;
  moderator: boolean;
}) {
  const appId = (process.env.JITSI_JWT_APP_ID || '').trim();
  const secret = (process.env.JITSI_JWT_APP_SECRET || '').trim();
  if (!appId || !secret) return undefined;

  const sub = jitsiPublicUrl().replace(/^https?:\/\//, '') || 'meet.jitsi';
  return signHs256Jwt(
    {
      aud: 'jitsi',
      iss: appId,
      sub,
      room: opts.room,
      context: {
        user: {
          id: String(opts.userId),
          name: opts.name,
          email: opts.email || undefined,
          moderator: opts.moderator ? 'true' : 'false',
        },
      },
    },
    secret,
  );
}
