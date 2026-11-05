import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { SiweMessage } from 'siwe';
import { Response } from 'express';
import { DatabaseService } from '../database/database.module';
import { Environment } from '../config/environment';
import { RequestWithId } from '../common/http';
import { NonceDto, VerifyDto } from './auth.dto';
import { addressBytes, audit, cookieName, cookieOptions, digest, equalHash, hexAddress, rateLimit, readCookie, requireBrowserMutation, secret, sessionCsrf } from './security';

export interface SessionContext {
  sessionId: string; userId: string; walletId: string; address: string; chainId: string;
  platformRole: 'investor' | 'platform_admin'; displayName: string | null; expiresAt: Date; csrfToken: string;
}
export type AuthRequest = RequestWithId & { sessionContext?: SessionContext };
export const loginStatement = 'Sign in to BrickShare. This verifies wallet control for an application session. It is not a blockchain transaction, payment, or property ownership proof.';

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService, private readonly config: ConfigService) {}
  get env() { return this.config.getOrThrow<Environment>('validated'); }
  async nonce(dto: NonceDto, request: RequestWithId, response: Response) {
    requireBrowserMutation(request, this.env); await this.database.requireReady();
    if (!this.env.AUTH_CHAIN_IDS.split(',').map(id => id.trim()).includes(String(dto.chainId))) throw new ForbiddenException('This sign-in chain is not enabled');
    await rateLimit(this.database.source.manager, request, 'nonce', 20);
    const id = randomUUID(); const nonce = randomBytes(32).toString('hex'); const binding = secret(); const csrf = secret();
    const issuedAt = new Date(); const expiresAt = new Date(issuedAt.getTime() + this.env.AUTH_CHALLENGE_TTL_SECONDS * 1000);
    const origin = new URL(this.env.AUTH_ORIGIN);
    const message = new SiweMessage({ domain: origin.host, scheme: origin.protocol.slice(0, -1), address: hexAddress(addressBytes(dto.address)), statement: loginStatement, uri: origin.origin + '/', version: '1', chainId: dto.chainId, nonce, issuedAt: issuedAt.toISOString(), expirationTime: expiresAt.toISOString(), requestId: id }).prepareMessage();
    await this.database.source.transaction(async manager => {
      await manager.query(`INSERT INTO auth_challenges(id,address,chain_id,nonce_hash,binding_hash,csrf_hash,message_hash,origin,domain,uri,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [id, addressBytes(dto.address), String(dto.chainId), digest(nonce), digest(binding), digest(csrf), digest(message), origin.origin, origin.host, origin.origin + '/', issuedAt, expiresAt]);
      await audit(manager, 'auth.challenge_issued', null, null, request, { challengeId: id });
    });
    response.cookie(cookieName(this.env, 'login'), binding, { ...cookieOptions(this.env), maxAge: this.env.AUTH_CHALLENGE_TTL_SECONDS * 1000 });
    return { challengeId: id, nonce, message, csrfToken: csrf, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString() };
  }
  async verify(dto: VerifyDto, request: RequestWithId, response: Response) {
    requireBrowserMutation(request, this.env); await this.database.requireReady();
    await rateLimit(this.database.source.manager, request, 'verify', 30);
    const binding = readCookie(request, cookieName(this.env, 'login'));
    const csrf = request.get('X-CSRF-Token');
    if (!binding || !csrf || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) throw new ForbiddenException('Login browser binding and CSRF token are required');
    // Claim once before expensive verification. Even an invalid signature spends
    // this browser-bound challenge; retry obtains a fresh nonce.
    const [challenge] = await this.database.source.query(`WITH claimed AS (UPDATE auth_challenges SET consumed_at=now() WHERE id=$1 AND binding_hash=$2 AND csrf_hash=$3 AND origin=$4 AND consumed_at IS NULL AND expires_at>now() RETURNING *) SELECT * FROM claimed`, [dto.challengeId, digest(binding), digest(csrf), this.env.AUTH_ORIGIN]);
    if (!challenge) throw new UnauthorizedException('Login challenge is expired, consumed or invalid');
    response.clearCookie(cookieName(this.env, 'login'), cookieOptions(this.env));
    try {
      const message = new SiweMessage(dto.message);
      const now = Date.now();
      if (!equalHash(dto.message, challenge.message_hash) || !equalHash(message.nonce, challenge.nonce_hash) || message.domain !== challenge.domain || message.uri !== challenge.uri || message.scheme !== new URL(challenge.origin).protocol.slice(0, -1) || message.version !== '1' || String(message.chainId) !== challenge.chain_id || !this.env.AUTH_CHAIN_IDS.split(',').map(id => id.trim()).includes(challenge.chain_id) || !addressBytes(message.address).equals(challenge.address) || message.issuedAt !== challenge.issued_at.toISOString() || message.expirationTime !== challenge.expires_at.toISOString() || message.requestId !== challenge.id || message.statement !== loginStatement || message.resources?.length || message.notBefore || Date.parse(message.issuedAt!) > now + 5000 || Date.parse(message.expirationTime!) <= now) throw new Error();
      // No provider means no implicit ERC-1271 fallback or arbitrary RPC access.
      const result = await message.verify({ signature: dto.signature, domain: challenge.domain, scheme: message.scheme, nonce: message.nonce, time: new Date(now).toISOString() }, { suppressExceptions: true });
      if (!result.success) throw new Error();
    } catch {
      await audit(this.database.source.manager, 'auth.login_failed', null, null, request, { challengeId: dto.challengeId });
      throw new UnauthorizedException('Invalid SIWE signature or message. Only EOA wallets are supported; request a new challenge.');
    }
    const token = secret(); const csrfToken = sessionCsrf(token);
    const session = await this.database.source.transaction(async manager => {
      // Address-level serialization prevents parallel first logins creating two users.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['wallet-login:' + challenge.address.toString('hex')]);
      let [wallet] = await manager.query(`SELECT w.*,u.status FROM wallet_identities w JOIN users u ON u.id=w.user_id WHERE w.address=$1`, [challenge.address]);
      if (!wallet) {
        const [user] = await manager.query('INSERT INTO users DEFAULT VALUES RETURNING id');
        [wallet] = await manager.query('INSERT INTO wallet_identities(user_id,address,verified_at) VALUES($1,$2,now()) RETURNING *', [user.id, challenge.address]);
      } else if (wallet.status !== 'active') throw new UnauthorizedException('Account is unavailable');
      else await manager.query('UPDATE wallet_identities SET verified_at=now() WHERE id=$1', [wallet.id]);
      const previous = readCookie(request, cookieName(this.env, 'session'));
      if (previous) await manager.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [digest(previous)]);
      const [row] = await manager.query(`INSERT INTO sessions(user_id,wallet_id,token_hash,csrf_hash,chain_id,origin,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+make_interval(secs=>$7)) RETURNING id,expires_at`, [wallet.user_id, wallet.id, digest(token), digest(csrfToken), challenge.chain_id, challenge.origin, this.env.AUTH_SESSION_TTL_SECONDS]);
      await audit(manager, 'auth.login_succeeded', wallet.user_id, null, request, { walletId: wallet.id, chainId: challenge.chain_id });
      return row;
    });
    response.cookie(cookieName(this.env, 'session'), token, { ...cookieOptions(this.env), maxAge: this.env.AUTH_SESSION_TTL_SECONDS * 1000 });
    return { authenticated: true, expiresAt: session.expires_at.toISOString() };
  }
  async context(request: RequestWithId): Promise<SessionContext | null> {
    await this.database.requireReady();
    const token = readCookie(request, cookieName(this.env, 'session'));
    if (!token) return null;
    if (request.headers.origin && request.headers.origin !== this.env.AUTH_ORIGIN) throw new ForbiddenException('Request origin is not allowed');
    const [row] = await this.database.source.query(`SELECT s.id,s.user_id,s.wallet_id,s.chain_id,s.expires_at,s.csrf_hash,u.platform_role,u.display_name,w.address FROM sessions s JOIN users u ON u.id=s.user_id JOIN wallet_identities w ON w.id=s.wallet_id AND w.user_id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' AND s.origin=$2`, [digest(token), this.env.AUTH_ORIGIN]);
    if (!row || !equalHash(sessionCsrf(token), row.csrf_hash) || !this.env.AUTH_CHAIN_IDS.split(',').map(id => id.trim()).includes(row.chain_id)) return null;
    return { sessionId: row.id, userId: row.user_id, walletId: row.wallet_id, address: hexAddress(row.address), chainId: row.chain_id, platformRole: row.platform_role, displayName: row.display_name, expiresAt: row.expires_at, csrfToken: sessionCsrf(token) };
  }
  async me(request: RequestWithId, response: Response) {
    if ((request.headers.origin && request.headers.origin !== this.env.AUTH_ORIGIN) || request.headers['sec-fetch-site'] === 'cross-site') throw new ForbiddenException('Request origin is not allowed');
    const session = await this.context(request);
    if (!session) { response.clearCookie(cookieName(this.env, 'session'), cookieOptions(this.env)); return { authenticated: false }; }
    return { authenticated: true, user: { id: session.userId, displayName: session.displayName, platformRole: session.platformRole }, wallet: { address: session.address, chainId: session.chainId, kind: 'EOA' }, expiresAt: session.expiresAt.toISOString(), csrfToken: session.csrfToken };
  }
  async logout(request: AuthRequest, response: Response) {
    const session = request.sessionContext!;
    await this.database.source.transaction(async manager => {
      await manager.query('UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL', [session.sessionId]);
      await audit(manager, 'auth.logout', session.userId, null, request);
    });
    response.clearCookie(cookieName(this.env, 'session'), cookieOptions(this.env));
    response.clearCookie(cookieName(this.env, 'login'), cookieOptions(this.env));
    return { authenticated: false };
  }
}
