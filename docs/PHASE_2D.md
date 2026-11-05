# Phase 2D — BrickShare Studio property management

Studio is an authenticated, tenant-owned workspace for fictional property
presentation data. It adds descriptions, characteristics, private local files,
draft preview, explicit publication/archival and version history. Solidity,
wallet transaction signing, purchase calculations and the indexer are preserved.
There are no investor payment, KYC, payout or trading features.

## Review map and architecture decisions

| Files | Responsibility |
| --- | --- |
| `apps/api/src/studio/studio.module.ts` | Session-guarded routes and controlled file responses |
| `studio.service.ts`, `studio.dto.ts` | Tenant/role checks, bounded input, version/attachment workflow and optimistic concurrency |
| `provenance.ts` | Local RPC verification before association, publication and public media reads |
| `storage.ts` | Replaceable storage interface, generated keys, file validation, image rewriting and integrity checks |
| `apps/api/src/database/studio.entities.ts` | TypeORM mappings for the five new tables |
| Migration `1731300000000-studio.ts`, `sql/004-studio.*.sql` | Explicit schema, composite FKs, indexes, immutability/ownership triggers, public characteristics |
| Existing API module/config/HTTP/assets/properties code | Studio wiring, upload bounds, local media presentation and public read-model compatibility |
| `react-frontend/src/pages/StudioPage.jsx`, `styles/studio.css` | Organization selector, collection table, editor, files, preview, history and publication review |
| `src/lib/api-auth.ts`, `api-client.ts`, `api-types.ts`, `indexed-catalog.ts` | Typed Studio methods and validated local media integration |
| Existing App/Navbar/navigation/property details and safe content URL code | Studio entry point and operator-supplied characteristics/media rendering |
| `src/data/studio-demo.js`, `public/samples/studio-overview.txt` | Clearly fictional demo content without financial data |
| API/frontend Studio tests, migration lifecycle tests and live integration | Authorization, isolation, files, publication, reset safety and compatibility |
| CI, `.gitignore`, `.env.example`, README, architecture/API/use cases | Automated checks, storage exclusion and setup/reference |
| `scripts/tests/local-deployment-smoke.cjs` | Explicitly disables the optional API in testnet fixture builds so local Vite env files cannot mask deployment checks |

The previous public metadata model had no organization ownership. Studio uses
separate private tables and publishes a snapshot into that existing public model
only after authorization. It never retroactively assigns legacy metadata to an
organization. The previous external-reference-only asset contract now additionally
supports `availability: "local_published"` with an exact `/api/v1/media/:uuid` URL.
The frontend resolves it against the configured API; arbitrary HTTP URLs remain
blocked. Existing external HTTPS assets continue working.

## Roles and ownership

| Capability | Owner | Editor | Viewer | Nonmember investor / platform admin |
| --- | --- | --- | --- | --- |
| Read tenant content, preview, history, private files | Yes | Yes | Yes | No |
| Create/edit drafts, upload files, select attachments, start revisions | Yes | Yes | No | No |
| Associate a verified indexed property | Yes, also requires contract-owner wallet proof | No | No | No |
| Explicitly publish/archive | Yes | No | No | No |

Investor is the default platform role. Membership grants organization-scoped
capabilities; an investor without membership has none. Platform-admin privileges
do not bypass tenant checks. Every request uses the existing session/CSRF guard.
Nonmember resource IDs return 404; insufficient member roles return 403.

For mutations the organization row is locked, membership is re-read, then the
record/version is locked. This serializes role changes and content mutations.
Private attachment links have composite organization/record/version/asset FKs.
Hiding a frontend control is never the authorization boundary.

## Draft and publication lifecycle

1. An owner/editor creates a fictional, unlinked record. Version 1 starts as a
   private draft with a title, location, description and allowlisted characteristics.
2. Save replaces draft content/attachment selection using `expectedRevision`.
   Concurrent stale saves return 409 instead of overwriting someone else's work.
3. Uploading stores an immutable file privately; it does not attach or publish it.
   Select its purpose, image alt text and optional caption, then save the draft.
4. Preview renders text safely, including unsaved edits, without publication.
5. An owner reviews and confirms publication with `confirmPublication: true` and
   the saved draft revision. Location and description must be nonempty. Linked
   records also require fresh, matching local-chain provenance and intact files.
6. A linked publication atomically archives the previous public snapshot and
   inserts the new metadata and attachment snapshot. The consumer marketplace
   continues deriving all financial fields from RPC. An unlinked fictional
   publication remains organization-private and never becomes a live listing.
7. Published/archived content and attachment references are immutable. Start a
   new version to copy and edit them. Version history retains published snapshots;
   intermediate saves within one draft are tracked by revision/audit, not full text
   snapshots for every keystroke.
8. Owner archival withdraws active public metadata/media and archives drafts and
   publications. History/files remain readable to members. An editor can prepare
   a new revision, but only an owner can republish it.

Supported characteristics are property type, bedrooms, bathrooms, area in square
metres and year built. Prices, wei, supply, balances, active contract status,
deployment identity and user/organization IDs are not writable content fields.

## Verified chain association

Studio candidates identify properties by **internal property UUID, chain ID,
contract address and on-chain ID**, with creation/deployment-instance provenance.
Names are display labels only. Initial association requires an organization owner
signed in as the verified contract-owner wallet on chain 31337. That proves
permission to delegate this record's metadata work to the organization, without
granting anyone Solidity permissions or platform administration privileges.

The API verifies active/canonical indexed identity, fresh synchronized cursor,
Hardhat run ID, genesis, receipt, deployment/indexed block hashes, runtime code,
owner and property view results through a configurable loopback read-only RPC.
The run ID is checked again after reads. Existing operator metadata cannot be
claimed or overwritten; use a separate reviewed migration if that is needed.
At most one Studio record may claim a property UUID. Associations cannot be
silently changed after a reset/reorg; create a new record for the new identity.

Publication and public media recheck identity/freshness. They fail closed when RPC
is unavailable, the indexer is stale, or the local chain resets—even before the
worker notices the reset. Private content remains editable and can be archived.
Chain state can change after any check; consumer provenance checks and wallet RPC
reads remain authoritative. Public-chain/Testnet Studio publishing is future work.

## Local files and security boundary

- Upload protocol is bounded JSON/base64 using the existing authenticated JSON/
  Origin/CSRF protocol. Only the specific upload route accepts a larger 1500 KiB
  JSON body; other endpoints keep the 16 KiB limit. Decoded files are at most 1 MiB.
- Accepted inputs: PNG, JPEG, WebP, UTF-8 TXT and download-only PDF. MIME type,
  extension and file signature must agree. Empty, corrupt/binary text, SVG, HTML,
  executable and oversized inputs are rejected. Obvious active/encrypted PDF
  constructs are rejected; this is not a comprehensive PDF parser or malware scan.
- Images are fully decoded, limited to 16 million pixels, resized within 2400×2400,
  stripped of input metadata and re-encoded as WebP. Animated images are rejected.
  The stored checksum/size describe the re-encoded output, not the original upload.
- Storage keys are random UUIDs independent of filenames. Paths, colons, control
  characters and hidden filenames are rejected. Storage rejects key traversal,
  symlinks and oversized reads; files use exclusive creation and restrictive modes
  where supported. The directory must be private, outside webroots/source folders.
- Every serve/publication checks file size and SHA-256. Private downloads require
  current tenant membership; public media requires an active published version,
  a matching public projection and fresh verified chain identity. An old archived
  version alone never authorizes a public file URL.
- Documents use generated download names, `Content-Disposition: attachment`,
  `nosniff`, sandbox CSP and `Cache-Control: no-store`. Images are rewritten WebP.
  The whole storage directory is never statically served.
- Limits: 100 records/org, 100 versions/record, 40 uploaded files/record, 20 attached
  files/version, one hero image/version and 50 MiB stored files/org. Existing
  authenticated mutation rate limits also apply. These are local demo limits.

`StudioStorage` exposes put/read/remove and is injected into the service. Replacing
it with S3 later must preserve authorization, immutable keys, integrity validation,
private access and publication withdrawal semantics; no S3 credentials are needed
now. Failed SQL uploads attempt file cleanup. A process crash between filesystem
write and DB commit can leave an unreferenced file; reconcile storage/DB before
future production use. Files detached from drafts remain in the private library;
there is no hard-delete/garbage-collection API this phase.

Archival cannot recall files already downloaded by a user. PDFs are not certified
safe; local demo files must be fictional. Add antivirus/CDR, broader abuse controls,
least-privilege filesystem/DB roles and deployment review before public hosting.
Tenant isolation is application-enforced with composite FK safeguards, not RLS.
Host/DB administrators can bypass application controls. Backup private files and
PostgreSQL together, without committing either to Git.

References: [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html),
[Sharp image decoder limits](https://sharp.pixelplumbing.com/api-constructor/).

## Migration and endpoints

Migration `Studio1731300000000` adds five tenant-owned tables, public metadata
characteristics, indexes, audit triggers and version/attachment/ownership guards.
It changes no Solidity/indexer financial schema. There is no schema synchronization
or automatic migration on API startup. Down migration is permitted before public
projections exist; afterwards it refuses destructive rollback to preserve public
history. Use a reviewed forward migration for an installation with publications.

All private routes below require a session; mutations additionally require exact
Origin, `X-BrickShare-Auth: 1`, JSON and session `X-CSRF-Token`.

| Method | `/api/v1/organizations/:orgId/studio` route | Purpose |
| --- | --- | --- |
| GET | `/records` | Collection + server permissions; maximum 100 |
| POST | `/records` | Create fictional draft; title/location/description/characteristics |
| GET | `/records/:id` | Tenant detail, versions, attachments and recent audit history |
| PATCH | `/records/:id/draft` | Save content/attachments with expectedRevision |
| POST | `/records/:id/revisions` | Create the next sequential draft from the latest version |
| GET | `/candidates` | Owner-only unclaimed indexed identities for the signed-in contract-owner wallet |
| POST | `/records/:id/association` | Owner-only live-verified `{propertyId}` association |
| POST | `/records/:id/publish` | Owner-only `{expectedRevision, confirmPublication:true}` |
| POST | `/records/:id/archive` | Owner-only `{confirmArchive:true}` |
| POST | `/records/:id/assets` | Private upload `{name,mimeType,base64}` |
| GET | `/records/:id/assets/:assetId` | Tenant-guarded private file bytes |

`GET /api/v1/media/:assetId` serves only eligible published linked assets without
cookie credentials. Public catalog endpoints remain unchanged except additive
`metadata.characteristics` and the `local_published` asset availability option.
Public metadata still includes indexed block/freshness labels, not live balances.

On a publication timeout, reload the workspace before retrying: the server may
have committed the operation even if the browser stopped waiting. Revision checks
and immutable publication history prevent a stale save from replacing that state.

## Local setup — Windows CMD

Keep your existing ignored `.env` files. From the repository root:

```bat
npm ci --prefix apps/api
npm ci --prefix react-frontend
docker compose --env-file apps/api/.env up -d postgres
npm run db:migrate
```

The migration applies to your configured application database only when **you**
run it. Automated verification uses disposable schemas, not your application data.
The local storage/RPC defaults work without new secrets; optionally add:

```dotenv
STUDIO_STORAGE_DIR=.brickshare-storage
STUDIO_RPC_URL=http://127.0.0.1:8545
```

Keep the Phase 2C settings: `AUTH_ORIGIN=http://127.0.0.1:5173`, that exact CORS
origin, local login chain 31337, and matching frontend/API hostnames/schemes.
Frontend ignored `.env.local` needs `VITE_API_BASE_URL=http://127.0.0.1:3001`.
Restart the API/frontend after environment changes. Never put DB/deployment
credentials in Vite variables, never serve `.brickshare-storage/` statically,
and do not commit the files or database.

Start separate CMD terminals:

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

Open **http://127.0.0.1:5173**. Draft editing works without a running chain/indexer;
verified association, linked publication and public media need them. The original
consumer app still works through RPC if the backend is unavailable.

## Manual demo / acceptance checklist

1. Connect an existing development EOA and **Sign in with wallet**. Create a
   fictional organization in Organizations, then open Studio.
2. Choose **New draft → Use fictional example → Create fictional draft**. Change
   characteristics/description, save and inspect Preview. This creates no contract
   listing and requests no transaction signature.
3. Upload a small PNG/JPEG/WebP and `react-frontend/public/samples/studio-overview.txt`.
   Select attachments, choose one cover image, enter alt text/captions, then save.
   Inspect the preview/downloads. An unauthenticated media URL must not serve them.
4. As owner, review/confirm publication. An unlinked fictional publication stays
   inside the workspace. Start a new version, edit, publish and inspect history.
5. Invite an editor and viewer through Organizations. Switch accounts and sign in
   again: editor can prepare drafts/files but cannot publish; viewer can only read.
   Another organization's account must not read a private record or file URL.
6. For consumer integration, use the original contract-owner wallet to create a
   fictional on-chain listing through Administration, wait for the indexer, and
   sign in to Studio as an organization owner using that same wallet.
7. Create a new Studio record, select its unclaimed verified identity, save content
   and publish. Check Marketplace/property details: description, characteristics,
   image/document update; price, supply, wallet balance and purchase total match RPC.
8. Archive the record: its metadata is withdrawn and previous public media URLs
   stop serving. Organization history/private files remain available.
9. Stop the API: consumer RPC browsing/transactions continue. Stop the indexer or
   reset Hardhat: linked publication/public media should fail with a clear error;
   private drafts/history remain available. Follow [INDEXER.md](INDEXER.md) for
   explicit reset recovery; never reuse old property identities automatically.

This checklist includes real browser/MetaMask checks; automated provider fixtures
do not replace those prompts. No real funds or property documents are needed.

## Automated verification and next work

Use an existing disposable PostgreSQL database whose name ends in `_test` and set
`TEST_DATABASE_URL`. Never point tests at the application database.

```bat
npm run test:api
npm run test:api:db
npm run test:indexer:live
npm run test:frontend
npm test
npm run test:config
npm run build
```

CI includes Studio unit/storage security, PostgreSQL workflow/isolation/migration,
frontend client/UI/transaction compatibility and a real Hardhat full-stack test.
The live test signs in, associates a verified property, uploads and publishes a
document, consumes it through the frontend client and verifies media reset safety.
No private credentials or public deployment are required.

Verified locally on 2026-11-06 with Node 22.19 and PostgreSQL 16:

| Check | Result |
| --- | --- |
| API unit/security/storage tests | 22 passed |
| PostgreSQL migrations/authorization/workflows/indexer tests | 43 passed |
| Frontend client/UI/session/purchase tests | 51 passed |
| Real Hardhat + SIWE + Studio + consumer API integration | 1 passed |
| Solidity contract tests | 19 passed |
| Deployment configuration tests | 5 passed |
| Local deployment and testnet fixture smoke checks | Passed |
| API build and frontend production/testnet fixture builds | Passed |

The API dependency audit reports zero advisories after selecting the patched
image decoder. Frontend dependencies were not changed; existing advisories and
Vite's main-bundle size warning remain. Migration upgrade/revert/reapply, catalog
preservation and refusal to roll back published projections were tested in isolated
disposable schemas. Your application database/private environment files were not
modified. Real MetaMask/browser interactions remain the manual checklist above.

Future work includes cloud storage adapters/scanning, orphan-file reconciliation,
retention/deletion policy, pagination beyond demo limits, richer gallery/history
comparison, reviewed legacy-content migration and production security review.
Public-chain Studio association and chain-aware contract-wallet authentication
remain separate phases. Existing frontend dependency advisories and Vite's bundle
size warning remain documented limitations; the API image decoder is pinned to a
patched release. This phase does not authorize public deployment or real funds.
