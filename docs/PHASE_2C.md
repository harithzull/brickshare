# Phase 2C — wallet authentication and organizations

This phase adds an optional application identity layer to BrickShare Invest and
an organization workspace foundation for Studio. Solidity, token permissions,
purchase calculations, wallet transaction signing and the read-only indexer are
unchanged. No property CMS, payment, KYC or trading endpoints are introduced.

## Implementation decisions

- The existing modular NestJS application gains AuthModule and OrganizationsModule.
  Identity services live in AuthModule; no microservices or external session store.
- SIWE uses the `siwe` 3.0.0 library in the API and browser. The browser checks the
  exact site, URI, wallet, chain, nonce, request ID, statement and time bounds before
  asking for an EIP-191 message signature. This signature sends no transaction.
- Supported login chains are explicitly configured from 31337/84532; local default
  is 31337. Login is wallet-control proof, not KYC, property ownership or permission
  to transact on someone else's behalf. No RPC or signing key is needed for EOA login.
- ERC-1271 contract wallet and ERC-6492 verification are not implemented. Only EOA
  signatures are accepted; there is no fallback to trusting the claimed address.
- Earlier public-only CORS/body parsing changes were necessary: bounded 16 KiB JSON,
  credentialed exact-origin CORS and new mutation headers. Public metadata requests
  still omit credentials and public RPC browsing requires no application session.
- Existing architecture's proposed content grants/CMS routes remain future work.
  Organization membership is an off-chain capability and grants no Solidity rights.

## Database migration

`1731200000000-auth-organizations.ts` runs reviewed `003-auth-organizations.up.sql`;
the paired down migration removes only this phase's tables. The existing catalog
and indexer migrations are unchanged. Synchronization and migration-on-start remain
disabled. Back up data before intentionally reverting: auth down removes sessions,
identities, memberships and audit history.

| Table | Main constraints and purpose |
| --- | --- |
| users | UUID; default investor role; active/suspended; optional display name |
| wallet_identities | Globally unique 20-byte nonzero address; user FK; EOA; verification time |
| auth_challenges | Random nonce/message/browser/CSRF hashes; exact origin/domain/URI/chain; expiry; atomic consumption |
| sessions | Unique token hash; CSRF hash; user/wallet composite FK; chain/origin; expiry/revocation |
| organizations | UUID; validated name; creator FK; timestamps |
| organization_memberships | Unique organization/user; owner/editor/viewer; immutable identity |
| organization_invitations | Organization/address/role; inviter; expiry/accept/revoke; unique pending wallet invitation |
| security_audit_logs | Actor/organization/subject FKs; allowlisted action; request ID; structured details; append-only update/delete trigger |
| auth_rate_limits | Hashed IP/scope/minute bucket; atomic counts; expiry index |

Expiry, wallet byte widths and role checks also exist in SQL. User/session, tenant,
invitation inbox and audit time queries have indexes. Organizations are created
with their initial owner in one transaction; a deferred constraint requires an
owner and a trigger prevents removing/demoting the last owner. Service writes lock
the organization row and re-read permissions, including concurrent owner changes.

## Authentication protocol

1. `POST /api/v1/auth/nonce` with `{address, chainId}` requests a five-minute
   challenge. A cryptographically random nonce, browser-binding cookie and separate
   login CSRF token are created. The response contains `challengeId`, `nonce`,
   `message`, `csrfToken`, `issuedAt`, `expiresAt`; only hashes are stored.
2. Sign the returned canonical message after client validation. `POST /auth/verify`
   sends `{challengeId, message, signature}` with the login CSRF token. The binding
   cookie must accompany it. Verification atomically spends the challenge before
   signature validation; an invalid attempt requires a new nonce. Parallel replay
   can establish at most one session.
3. Successful verification returns `{authenticated:true, expiresAt}` and rotates
   the browser's previous session. A 256-bit opaque cookie establishes a fixed
   lifetime session (one hour default). GET `/me` returns the verified user, wallet,
   chain, expiration and session CSRF token. Anonymous/expired sessions return
   `{authenticated:false}`; private resources return 401.
4. All mutations require JSON, `Origin: AUTH_ORIGIN`, `X-BrickShare-Auth: 1` and,
   except nonce issuance, `X-CSRF-Token` from the appropriate challenge/session.
   Cross-site browser contexts fail. CORS allows explicit origins only; configured
   public-read origins do not become authorized login origins.
5. POST `/auth/logout` revokes the current DB session and clears cookies. Signing
   out clears frontend permissions immediately; server revocation cannot be
   guaranteed during an outage, and the UI says so. The server always enforces expiry.

All paths above have the `/api/v1` prefix. Cookies are HttpOnly, host-only,
SameSite=Strict, Path=/, with Secure and `__Host-` names when configured for HTTPS.
No auth tokens are stored in localStorage/sessionStorage. CSRF is derived from
the opaque session cookie using a context-specific HMAC; only its hash is stored.
Session and membership/role state is checked on each private request. Browser
account/network/disconnect events clear local authorization, abort old requests
and attempt server logout. Polling restores current server permissions every 30s;
an expiry timer removes expired UI privileges. These are UI protections, not
backend reliance on wallet events or frontend role flags.

The local limiter allows 20 nonce requests/minute/IP, 30 verification requests,
and 60 authenticated mutations/user/IP. Forwarded headers are not trusted. Behind
a future proxy, review trust-proxy configuration and rate policy before hosting.

## Endpoints and roles

| Method and `/api/v1` path | Access / behavior |
| --- | --- |
| POST /auth/nonce, /auth/verify | Browser-bound login protocol |
| POST /auth/logout | Session + CSRF |
| GET /me | Anonymous state or minimal own session |
| GET /organizations | Only caller's memberships; maximum 100 |
| POST /organizations | Signed-in investor; creator becomes owner; max 20 created organizations/user |
| GET /organizations/:id | Any member |
| PATCH /organizations/:id | Owner/editor; `{name}` only |
| GET /organizations/:id/members | Any member; maximum 1000 |
| PATCH /organizations/:id/members/:memberId | Owner; `{role:owner\|editor\|viewer}`; last owner protected |
| DELETE /organizations/:id/members/:memberId | Owner; last owner protected |
| GET, POST /organizations/:id/invitations | Owner; new `{address,role:editor\|viewer}`; 48h expiry; max 100 pending |
| DELETE /organizations/:id/invitations/:invitationId | Owner; revoke pending invite |
| GET /invitations | Only valid pending invitations for the signed-in wallet |
| POST /invitations/:id/accept | Invited wallet only; single use; issuer must still be an active owner |
| GET /organizations/:id/audit | Owner; most recent 100 organization audit entries |
| GET /platform/organizations | Explicit platform_admin only; names/IDs/timestamps, no tenant membership bypass |

Unknown fields and invalid UUIDs/roles are rejected. Nonmember organization/resource
IDs return 404; insufficient permissions inside one's organization return 403.
An invitation cannot create an owner or change an existing membership's role;
only an existing owner can explicitly promote a joined member. Suspended users
cannot use sessions. Invitation acceptance fails for expired/revoked invitations
and inactive/removed/demoted inviters. Audit records contain IDs/actions, not raw
messages, signatures, nonces, cookies, private keys or session/CSRF tokens.

Investor is the default platform role; organization roles are separate. A platform
administrator does not inherit tenant owner/editor privileges. Contract owner is
determined by the original contract reads and continues to control only the
existing on-chain administration UI. Neither first login nor deployment grants
platform administrator access.

## Local setup — Windows CMD

Use Node 22.19+ (22.x), PostgreSQL 16/Docker Compose and existing Hardhat setup.
From the repository root, update dependencies and migrate:

```bat
npm ci
npm ci --prefix apps/api
npm ci --prefix react-frontend
docker compose --env-file apps/api/.env up -d postgres
npm run db:migrate
npm run db:seed:networks
```

For a new checkout first `copy apps\api\.env.example apps\api\.env` and fill
your local DB password/URL. For an existing installation, keep `.env` and add:

```dotenv
AUTH_ORIGIN=http://127.0.0.1:5173
AUTH_CHAIN_IDS=31337
AUTH_CHALLENGE_TTL_SECONDS=300
AUTH_SESSION_TTL_SECONDS=3600
AUTH_COOKIE_SECURE=false
ALLOW_LOCAL_ADMIN_BOOTSTRAP=false
```

Ensure `CORS_ORIGINS` includes the exact AUTH_ORIGIN. Set the public frontend
`VITE_API_BASE_URL=http://127.0.0.1:3001` in ignored
`react-frontend/.env.local`. Never put deployment/DB credentials in Vite variables.

Run separate CMD terminals, in order:

```bat
npm run node
```

```bat
npm run deploy:local
npm run dev:api
```

```bat
npm run dev:indexer
```

```bat
npm --prefix react-frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://127.0.0.1:5173**. Use an existing unfunded/local development EOA,
connect to Hardhat, then choose **Sign in with wallet**. Create a clearly fictional
organization such as `FICTIONAL Cedar Studio`, invite another development wallet,
switch accounts, sign in again and accept its invitation. Invitation delivery is
an in-app wallet inbox; no email or identity documents are collected. Existing
Hardhat restarts may require the explicit rebind procedure in [INDEXER.md](INDEXER.md).
Authentication itself works without an indexer or funded wallet.

After signing in once, an operator may explicitly grant platform admin locally:

```bat
set "ALLOW_LOCAL_ADMIN_BOOTSTRAP=true"
npm run auth:platform-admin -- 0xYOUR_VERIFIED_DEVELOPMENT_WALLET grant
set "ALLOW_LOCAL_ADMIN_BOOTSTRAP="
```

Use `revoke` instead of `grant` to remove it. The command requires an existing
verified identity, records an operator audit event, and is forbidden in production.
Keep the flag false in the normal `.env`. No signing key is used or requested.

## Verification and troubleshooting

Implementation files are grouped for review:

- `apps/api/src/auth/`: DTOs, SIWE/session service, cookie/CSRF/rate-limit helpers,
  route/guard module and explicit local platform-admin CLI.
- `apps/api/src/organizations/`: DTOs, tenant-scoped services and guarded routes.
- `apps/api/src/database/auth.entities.ts`, `data-source.ts` and migration
  `1731200000000` / `sql/003-*`: entity mappings and explicit schema changes.
- API `app.module.ts`, `config/environment.ts`, `common/http.ts`, package scripts,
  lockfile and `.env.example`: module wiring and HTTP/configuration foundation.
- `react-frontend/src/lib/api-auth.ts`, `hooks/useWalletSession.js`,
  `components/WalletSessionPanel.jsx`, `pages/OrganizationsPage.jsx`: private client,
  session lifecycle and workspace UI. `App.jsx`, `Navbar.jsx`, navigation and
  dashboard CSS connect them; Vite adds the SIWE browser Buffer alias/lazy bundle.
- API `auth.unit.test.ts`, `auth.database.test.ts`, existing migration lifecycle
  tests and `indexer.live.test.ts`; frontend `auth-client.test.mjs` and
  `wallet-session.test.mjs`: security, migrations and compatibility coverage.
- Root/frontend/API scripts and dependency lockfiles, `.github/workflows/ci.yml`,
  README, architecture/API guide and this delivery document.

Set TEST_DATABASE_URL to an existing **disposable database ending in `_test`**.
It must differ from the application database; do not use investor or application
data. Database tests create/drop randomized isolated schemas.

```bat
npm run test:api
npm run test:api:db
npm run test:indexer:live
npm run test:frontend
npm test
npm run test:config
npm run build
```

CI runs these suites using a disposable PostgreSQL service and ephemeral wallets,
with no private credentials. The live integration test starts an isolated Hardhat
node and exercises indexer/reorg/reset, the public metadata client and private
HTTP SIWE login/create-organization/logout in the same test.

Verified locally on 2026-11-05 with Node 22.19 and PostgreSQL 16:

| Check | Result |
| --- | --- |
| API unit/security tests | 19 passed |
| PostgreSQL integration/migration/security tests | 37 passed |
| Real-chain/full-stack HTTP integration | 1 passed |
| Frontend/client/session/UI/purchase compatibility tests | 45 passed |
| Solidity tests | 19 passed |
| Deployment configuration tests | 5 passed |
| Local deployment/purchase/transfer/withdrawal smoke | Passed |
| API build, frontend production build, testnet fixture build | Passed |

Migration upgrade, rollback/reapply and catalog preservation were tested in
isolated disposable schemas. The application database and private `.env` files
were not changed. Real MetaMask prompts remain a manual browser check. Vite still
reports a main bundle over 500 KiB; the SIWE parser is lazy-loaded separately.
Dependency installation reported zero API advisories and the frontend's existing
22 advisories (12 low, 4 moderate, 6 high). Review/update those dependencies before
public hosting; no forced major dependency migration is part of this phase.

- `schema_pending`/503: start PostgreSQL and run `npm run db:migrate`, then retry.
- Sign-in unavailable: set VITE_API_BASE_URL and restart Vite; check API health.
- Cookies/403: do not mix localhost/127.0.0.1; use exact AUTH_ORIGIN and fixed Vite
  port. Secure cookies require HTTPS; use false only for loopback HTTP.
- Invalid nonce/signature: obtain a fresh challenge, check clock/network/account,
  and use an EOA. A second tab requesting a nonce replaces the browser binding.
- Permission denied: refresh/sign in and check membership; an owner must invite
  or promote you. Being contract deployer grants no API administration rights.
- API outage: RPC reads and wallet transactions remain available. Private org
  records are unavailable; logout clears local privileges but revocation needs API
  recovery or expiry. An existing valid server cookie is not erased by JavaScript.

## Remaining limitations / next work

This is a local-first foundation, not a public deployment approval or security
audit. Manually exercise real MetaMask prompts/account switching in your browser;
automated wallet tests use injected provider fixtures. Auth UI cannot eliminate
XSS; maintain safe rendering and review CSP/dependency hardening before hosting.
HTTPS/secure cookies are configuration-validated, but no cloud TLS/proxy deployment
is provided. Same-host/scheme frontend/API is required by this implementation.

Tenant checks are application-enforced, not PostgreSQL RLS; future private
property/CMS records must explicitly carry tenant FKs and use scoped guards.
There is no tenant ownership migration for existing public metadata. A DB owner
can bypass trigger protections; use separate least-privilege runtime/migration
roles before hosting, with audit INSERT/SELECT only for runtime. Audit triggers
are defense in depth, not tamper-proof storage against DB administrators.

Retention/cleanup for expired challenges/sessions/audit, pagination beyond the
documented limits, organization deletion/leave/recovery, wallet linking/recovery,
global session management, ERC-1271/6492, proxy abuse controls and production
security review remain separate work. Pending invites are invalid while their
issuer lacks active ownership; explicit revocation permanently cancels them.
No organization property CMS, rental payout, KYC, investor documents, secondary
market or real-funds integration is included.

References: [SIWE library](https://github.com/spruceid/siwe),
[ERC-4361](https://eips.ethereum.org/EIPS/eip-4361),
[OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
