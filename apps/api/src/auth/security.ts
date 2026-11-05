import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getAddress } from 'ethers';
import { CookieOptions, Request } from 'express';
import { EntityManager } from 'typeorm';
import { Environment } from '../config/environment';
import { RequestWithId } from '../common/http';

export const digest = (value: string) => createHash('sha256').update(value).digest();
export const secret = () => randomBytes(32).toString('base64url');
export const sessionCsrf = (token: string) => createHmac('sha256', token).update('brickshare-session-csrf-v1').digest('base64url');
export function equalHash(value: string | undefined, expected: Buffer): boolean { return typeof value === 'string' && value.length <= 4096 && expected.length === 32 && timingSafeEqual(digest(value), expected); }
export function addressBytes(value: string) {
  try { const address = getAddress(value); if (/^0x0{40}$/i.test(address)) throw new Error(); return Buffer.from(address.slice(2), 'hex'); }
  catch { throw new BadRequestException('A valid nonzero wallet address is required'); }
}
export const hexAddress = (buffer: Buffer) => getAddress('0x' + buffer.toString('hex'));
export const cookieName = (env: Environment, kind: 'session' | 'login') => `${env.AUTH_COOKIE_SECURE ? '__Host-' : ''}brickshare_${kind}`;
export const cookieOptions = (env: Environment): CookieOptions => ({ httpOnly: true, sameSite: 'strict', secure: env.AUTH_COOKIE_SECURE, path: '/' });
export function readCookie(request: Request, name: string): string | undefined {
  const values = (request.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(name + '=')).map(part => part.slice(name.length + 1));
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]) ? values[0] : undefined;
}
export function requireOrigin(request: Request, env: Environment) {
  if (request.headers.origin !== env.AUTH_ORIGIN || request.headers['sec-fetch-site'] === 'cross-site') throw new ForbiddenException('Request origin is not allowed');
}
export function requireBrowserMutation(request: Request, env: Environment) {
  requireOrigin(request, env);
  if (request.headers['x-brickshare-auth'] !== '1' || !request.is('application/json')) throw new ForbiddenException('JSON browser request headers are required');
}
export async function rateLimit(manager: EntityManager, request: Request, scope: string, limit: number) {
  const bucket = digest(`${scope}:${request.ip ?? 'unknown'}:${Math.floor(Date.now() / 60000)}`);
  const [row] = await manager.query(`INSERT INTO auth_rate_limits(bucket_hash,count,expires_at) VALUES($1,1,now()+interval '2 minutes') ON CONFLICT(bucket_hash) DO UPDATE SET count=auth_rate_limits.count+1 RETURNING count`, [bucket]);
  await manager.query('DELETE FROM auth_rate_limits WHERE expires_at<now()');
  if (row.count > limit) throw new HttpException('Too many requests; try again shortly', 429);
}
export async function audit(manager: EntityManager, action: string, actor: string | null, org: string | null, request?: RequestWithId, details: Record<string, string> = {}, subject: string | null = null) {
  await manager.query('INSERT INTO security_audit_logs(action,actor_user_id,organization_id,subject_user_id,request_id,details) VALUES($1,$2,$3,$4,$5,$6)', [action, actor, org, subject, request?.requestId ?? null, JSON.stringify(details)]);
}
