import { ApiError } from './api-client.ts';
import type { ApiSettings } from './api-types.ts';

export interface AuthenticatedSession {
  authenticated: true;
  user: { id: string; displayName: string | null; platformRole: 'investor' | 'platform_admin' };
  wallet: { address: string; chainId: string; kind: 'EOA' };
  expiresAt: string; csrfToken: string;
}
export type SessionResponse = AuthenticatedSession | { authenticated: false };
export interface LoginChallenge { challengeId: string; nonce: string; message: string; csrfToken: string; issuedAt: string; expiresAt: string; }
export type OrganizationRole = 'owner' | 'editor' | 'viewer';
export interface OrganizationSummary { id: string; name: string; role: OrganizationRole; createdAt: string; permissions: { readMembers: boolean; editOrganization: boolean; manageMembers: boolean; manageInvitations: boolean; readAudit: boolean }; }
const uuid = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const token = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const address = (value: unknown) => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const role = (value: unknown) => ['owner', 'editor', 'viewer'].includes(String(value));
const organization = (value: unknown): value is OrganizationSummary => object(value) && uuid(value.id) && typeof value.name === 'string' && role(value.role) && date(value.createdAt) && object(value.permissions) && ['readMembers', 'editOrganization', 'manageMembers', 'manageInvitations', 'readAudit'].every(key => typeof value.permissions[key] === 'boolean');
const statement = 'Sign in to BrickShare. This verifies wallet control for an application session. It is not a blockchain transaction, payment, or property ownership proof.';
export async function assertLoginMessage(challenge: LoginChallenge, origin: string, wallet: string, chainId: number, now = Date.now()) {
  try {
    const { SiweMessage } = await import('siwe');
    const parsed = new SiweMessage(challenge.message); const target = new URL(origin);
    if (parsed.prepareMessage() !== challenge.message || parsed.domain !== target.host || parsed.scheme !== target.protocol.slice(0, -1) || parsed.uri !== target.origin + '/' || parsed.address.toLowerCase() !== wallet.toLowerCase() || parsed.chainId !== chainId || parsed.version !== '1' || parsed.nonce !== challenge.nonce || parsed.requestId !== challenge.challengeId || parsed.statement !== statement || parsed.notBefore || parsed.resources?.length || parsed.issuedAt !== challenge.issuedAt || parsed.expirationTime !== challenge.expiresAt || Date.parse(challenge.issuedAt) > now + 5000 || Date.parse(challenge.issuedAt) < now - 600000 || Date.parse(challenge.expiresAt) <= now || Date.parse(challenge.expiresAt) - Date.parse(challenge.issuedAt) > 600000) throw new Error();
  } catch { throw new ApiError('siwe_message', 'The sign-in message does not match this site, wallet, chain or expiration. No signature was requested.'); }
}
export class AuthClient {
  private csrf: string | null = null;
  readonly settings: ApiSettings;
  readonly origin: string;
  private readonly fetcher: typeof fetch;
  constructor(settings: ApiSettings, origin: string, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.settings = settings; this.origin = origin; this.fetcher = fetcher;
  }
  private checkSite() {
    if (!this.settings.baseUrl) throw new ApiError('disabled', 'Enable the public API URL to use wallet sign-in. Wallet transactions remain available.');
    const api = new URL(this.settings.baseUrl); const app = new URL(this.origin);
    if (api.hostname !== app.hostname || api.protocol !== app.protocol) throw new ApiError('cookie_site', 'Sign-in needs matching frontend/API hostnames and schemes. Use 127.0.0.1 for both, or localhost for both, and check AUTH_ORIGIN.');
  }
  private async request<T>(path: string, method: string, body: unknown, validate: (value: unknown) => boolean, signal?: AbortSignal, csrf?: string, binary = false): Promise<T> {
    this.checkSite();
    const controller = new AbortController(); let timedOut = false;
    const cancel = () => controller.abort(); signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel();
    const timer = setTimeout(() => { timedOut = true; cancel(); }, this.settings.timeoutMs);
    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<never>((_, reject) => { onAbort = () => reject(new ApiError(timedOut ? 'timeout' : 'aborted', timedOut ? 'Sign-in API timed out. Wallet transactions remain available.' : 'Sign-in request cancelled.')); controller.signal.addEventListener('abort', onAbort, { once: true }); if (controller.signal.aborted) onAbort(); });
    try {
      return await Promise.race([cancelled, (async () => {
        if (controller.signal.aborted) throw new ApiError('aborted', 'Sign-in request cancelled.');
        const headers: Record<string, string> = { Accept: 'application/json', 'X-BrickShare-Auth': '1' };
        if (method !== 'GET') { headers['Content-Type'] = 'application/json'; if (csrf ?? this.csrf) headers['X-CSRF-Token'] = (csrf ?? this.csrf)!; }
        const response = await this.fetcher(this.settings.baseUrl + path, { method, headers, credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal, ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }) });
        if (!response.ok) {
          if (response.status === 401) this.csrf = null;
          if (path.includes('/studio/') && response.status >= 400 && response.status < 500 && response.status !== 401) {
            let detail: unknown;
            try { detail = (await response.json())?.error?.message; } catch { /* Fall through to redacted status text. */ }
            if (Array.isArray(detail) && detail.every(item => typeof item === 'string')) detail = detail.slice(0,4).join('; ');
            if (typeof detail === 'string' && detail.length > 0 && detail.length <= 500) throw new ApiError('studio_http', detail, response.status);
          }
          throw new ApiError(response.status === 401 ? 'unauthorized' : 'auth_http', response.status === 401 ? 'Sign-in expired or the signature/challenge was invalid. Sign in again.' : response.status === 403 ? 'Access denied. Check your organization role, AUTH_ORIGIN and session/CSRF settings.' : response.status === 404 ? 'Organization or invitation is unavailable to this account.' : response.status === 409 ? 'This change conflicts with membership, invitation or last-owner rules.' : response.status === 429 ? 'Too many sign-in requests. Wait a minute before retrying.' : 'The sign-in or organization request failed.', response.status);
        }
        if (binary) return await response.blob() as T;
        const value: unknown = await response.json();
        if (!validate(value)) throw new ApiError('auth_response', 'The authentication API returned an incompatible response.');
        return value as T;
      })()]);
    } catch (error) {
      if (controller.signal.aborted) throw new ApiError(timedOut ? 'timeout' : 'aborted', timedOut ? 'Sign-in API timed out.' : 'Sign-in request cancelled.');
      if (error instanceof ApiError) throw error;
      throw new ApiError('auth_network', 'Sign-in API is unavailable. Check API startup, matching hosts and CORS. Wallet transactions remain available.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); if (onAbort) controller.signal.removeEventListener('abort', onAbort); }
  }
  async me(signal?: AbortSignal): Promise<SessionResponse> {
    const session = await this.request<SessionResponse>('/api/v1/me', 'GET', null, value => object(value) && (value.authenticated === false || (value.authenticated === true && object(value.user) && uuid(value.user.id) && ['investor', 'platform_admin'].includes(value.user.platformRole) && (value.user.displayName === null || typeof value.user.displayName === 'string') && object(value.wallet) && address(value.wallet.address) && ['31337', '84532'].includes(value.wallet.chainId) && value.wallet.kind === 'EOA' && date(value.expiresAt) && token(value.csrfToken))), signal);
    this.csrf = session.authenticated ? session.csrfToken : null; return session;
  }
  async nonce(address: string, chainId: number, signal?: AbortSignal) {
    const challenge = await this.request<LoginChallenge>('/api/v1/auth/nonce', 'POST', { address, chainId }, value => object(value) && uuid(value.challengeId) && typeof value.nonce === 'string' && /^[a-f0-9]{64}$/.test(value.nonce) && typeof value.message === 'string' && value.message.length <= 4096 && token(value.csrfToken) && date(value.issuedAt) && date(value.expiresAt), signal);
    await assertLoginMessage(challenge, this.origin, address, chainId); return challenge;
  }
  verify(challenge: LoginChallenge, signature: string, signal?: AbortSignal) { return this.request<{ authenticated: true; expiresAt: string }>('/api/v1/auth/verify', 'POST', { challengeId: challenge.challengeId, message: challenge.message, signature }, value => object(value) && value.authenticated === true && date(value.expiresAt), signal, challenge.csrfToken); }
  async logout(signal?: AbortSignal) {
    try {
      if (!this.csrf && !(await this.me(signal)).authenticated) return;
      await this.request('/api/v1/auth/logout', 'POST', {}, value => object(value) && value.authenticated === false, signal);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
    } finally { this.csrf = null; }
  }
  organizations(signal?: AbortSignal) { return this.request<{ data: OrganizationSummary[] }>('/api/v1/organizations', 'GET', null, value => object(value) && Array.isArray(value.data) && value.data.length <= 100 && value.data.every(organization), signal); }
  createOrganization(name: string, signal?: AbortSignal) { return this.request<{ data: OrganizationSummary }>('/api/v1/organizations', 'POST', { name }, value => object(value) && organization(value.data), signal); }
  private id(value: string) { if (!uuid(value)) throw new ApiError('query', 'A valid organization resource UUID is required.'); return value; }
  renameOrganization(id: string, name: string, signal?: AbortSignal) { return this.request<{ data: OrganizationSummary }>(`/api/v1/organizations/${this.id(id)}`, 'PATCH', { name }, value => object(value) && organization(value.data), signal); }
  members(id: string, signal?: AbortSignal) { return this.request<{ organization: OrganizationSummary; data: Array<{ id: string; userId: string; role: OrganizationRole; address: string | null; displayName: string | null; joinedAt: string }> }>(`/api/v1/organizations/${this.id(id)}/members`, 'GET', null, value => object(value) && organization(value.organization) && Array.isArray(value.data) && value.data.every((m: any) => object(m) && uuid(m.id) && uuid(m.userId) && role(m.role) && (m.address === null || address(m.address)) && date(m.joinedAt)), signal); }
  changeRole(orgId: string, memberId: string, role: OrganizationRole, signal?: AbortSignal) { return this.request(`/api/v1/organizations/${this.id(orgId)}/members/${this.id(memberId)}`, 'PATCH', { role }, value => object(value) && value.updated === true, signal); }
  removeMember(orgId: string, memberId: string, signal?: AbortSignal) { return this.request(`/api/v1/organizations/${this.id(orgId)}/members/${this.id(memberId)}`, 'DELETE', {}, value => object(value) && value.removed === true, signal); }
  invite(orgId: string, address: string, role: 'editor' | 'viewer', signal?: AbortSignal) { return this.request(`/api/v1/organizations/${this.id(orgId)}/invitations`, 'POST', { address, role }, value => object(value) && object(value.data) && uuid(value.data.id), signal); }
  inbox(signal?: AbortSignal) { return this.request<{ data: Array<{ id: string; organizationName: string; role: 'editor' | 'viewer'; expiresAt: string }> }>('/api/v1/invitations', 'GET', null, value => object(value) && Array.isArray(value.data) && value.data.every((i: any) => object(i) && uuid(i.id) && ['editor', 'viewer'].includes(i.role) && typeof i.organizationName === 'string' && date(i.expiresAt)), signal); }
  accept(id: string, signal?: AbortSignal) { return this.request<{ organizationId: string }>(`/api/v1/invitations/${this.id(id)}/accept`, 'POST', {}, value => object(value) && uuid(value.organizationId), signal); }
  invitations(id: string, signal?: AbortSignal) { return this.request<{ data: Array<{ id: string; address: string; role: 'editor' | 'viewer'; expiresAt: string }> }>(`/api/v1/organizations/${this.id(id)}/invitations`, 'GET', null, value => object(value) && Array.isArray(value.data) && value.data.every((i: any) => object(i) && uuid(i.id) && address(i.address) && ['editor', 'viewer'].includes(i.role) && date(i.expiresAt)), signal); }
  revoke(orgId: string, invitationId: string, signal?: AbortSignal) { return this.request(`/api/v1/organizations/${this.id(orgId)}/invitations/${this.id(invitationId)}`, 'DELETE', {}, value => object(value) && value.revoked === true, signal); }
  audit(id: string, signal?: AbortSignal) { return this.request<{ data: Array<{ id: string; action: string; createdAt: string }> }>(`/api/v1/organizations/${this.id(id)}/audit`, 'GET', null, value => object(value) && Array.isArray(value.data) && value.data.every((a: any) => object(a) && uuid(a.id) && typeof a.action === 'string' && date(a.createdAt)), signal); }
  directory(signal?: AbortSignal) { return this.request<{ data: Array<{ id: string; name: string; createdAt: string }> }>('/api/v1/platform/organizations', 'GET', null, value => object(value) && Array.isArray(value.data) && value.data.every((o: any) => object(o) && uuid(o.id) && typeof o.name === 'string' && date(o.createdAt)), signal); }
  private studioPath(orgId: string, recordId?: string) { return `/api/v1/organizations/${this.id(orgId)}/studio/records${recordId ? '/' + this.id(recordId) : ''}`; }
  studioCandidates(orgId:string,signal?:AbortSignal) {return this.request<{data:Array<{propertyId:string;onChainId:string;chainId:string;contractAddress:string;name:string}>}>(`/api/v1/organizations/${this.id(orgId)}/studio/candidates`,'GET',null,value=>object(value)&&Array.isArray(value.data)&&value.data.every((p:any)=>uuid(p.propertyId)&&typeof p.onChainId==='string'&&typeof p.chainId==='string'&&address(p.contractAddress)&&typeof p.name==='string'),signal);}
  studioRecords(orgId: string, signal?: AbortSignal) { return this.request<StudioList>(this.studioPath(orgId), 'GET', null, value => object(value) && Array.isArray(value.data) && value.data.every((r: any) => uuid(r.id) && typeof r.title === 'string' && ['draft','published','archived'].includes(r.state)) && studioPermissions(value.permissions), signal); }
  studioRecord(orgId: string, id: string, signal?: AbortSignal) { return this.request<StudioDetail>(this.studioPath(orgId,id), 'GET', null, value => object(value) && object(value.data) && value.data.id === id && value.data.organizationId === orgId && Array.isArray(value.data.versions) && value.data.versions.every((v: any) => uuid(v.id) && Number.isInteger(v.version) && Number.isInteger(v.revision) && ['draft','published','archived'].includes(v.state) && typeof v.title === 'string' && typeof v.description === 'string' && object(v.characteristics) && Array.isArray(v.assets)) && Array.isArray(value.data.assets) && Array.isArray(value.data.history) && studioPermissions(value.permissions), signal); }
  studioCreate(orgId: string, body: StudioDraft, signal?: AbortSignal) { return this.request<{id:string}>(this.studioPath(orgId), 'POST', body, value => object(value) && uuid(value.id), signal); }
  studioSave(orgId: string, id: string, body: StudioDraft & {expectedRevision:number;assets:StudioAttachment[]}, signal?: AbortSignal) { return this.request(this.studioPath(orgId,id)+'/draft', 'PATCH', body, value => object(value) && value.updated === true && Number.isInteger(value.revision), signal); }
  studioRevise(orgId: string,id: string,signal?:AbortSignal) { return this.request(this.studioPath(orgId,id)+'/revisions','POST',{},value=>object(value)&&uuid(value.id),signal); }
  studioAssociate(orgId:string,id:string,propertyId:string,signal?:AbortSignal) { return this.request(this.studioPath(orgId,id)+'/association','POST',{propertyId:this.id(propertyId)},value=>object(value)&&value.associated===true,signal); }
  studioPublish(orgId:string,id:string,revision:number,signal?:AbortSignal) { return this.request(this.studioPath(orgId,id)+'/publish','POST',{expectedRevision:revision,confirmPublication:true},value=>object(value)&&value.published===true,signal); }
  studioArchive(orgId:string,id:string,signal?:AbortSignal) { return this.request(this.studioPath(orgId,id)+'/archive','POST',{confirmArchive:true},value=>object(value)&&value.archived===true,signal); }
  studioUpload(orgId:string,id:string,body:{name:string;mimeType:string;base64:string},signal?:AbortSignal) { return this.request<{id:string}>(this.studioPath(orgId,id)+'/assets','POST',body,value=>object(value)&&uuid(value.id),signal); }
  studioAsset(orgId:string,id:string,assetId:string,signal?:AbortSignal) { return this.request<Blob>(this.studioPath(orgId,id)+'/assets/'+this.id(assetId),'GET',null,()=>true,signal,undefined,true); }
}
export interface StudioPermissions { role: OrganizationRole; canEdit:boolean; canPublish:boolean; }
const studioPermissions=(v:unknown):boolean=>object(v)&&role(v.role)&&typeof v.canEdit==='boolean'&&typeof v.canPublish==='boolean';
export interface StudioDraft { title:string; location:string; description:string; characteristics:Record<string,string|number>; }
export interface StudioAttachment { assetId:string; purpose:'hero'|'gallery'|'supporting_document';altText:string;caption:string; }
export interface StudioVersion extends StudioDraft { id:string;version:number;revision:number;state:'draft'|'published'|'archived';publishedAt:string|null;updatedAt:string;assets:StudioAttachment[]; }
export interface StudioList { data:Array<{id:string;title:string;state:string;version:number;archived:boolean;propertyId:string|null;updatedAt:string}>;permissions:StudioPermissions;limit:number; }
export interface StudioDetail { data:{id:string;organizationId:string;propertyId:string|null;archived:boolean;association:null|{propertyId:string;onChainId:string;chainId:string;contractAddress:string;canonical:boolean;note:string};versions:StudioVersion[];assets:Array<{id:string;name:string;kind:'image'|'document';mimeType:string;byteSize:number;sha256:string}>;history:Array<{action:string;versionId:string|null;actorUserId:string;createdAt:string}>};permissions:StudioPermissions; }
