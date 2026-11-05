# BrickShare

A local real estate tokenization demo built with Solidity, Hardhat, React, Vite,
and ethers.js. An administrator lists properties, investors purchase fractional
tokens with test ETH, and holders transfer tokens between wallets.

This is a development demo. Token balances are application records; they do not
establish legal ownership of a property. There is no rental income distribution,
refund system, or secondary marketplace in this version.

## BrickShare 2.0 — Phase 1

The existing application now supports separate localhost and **Base Sepolia**
deployments, validated public frontend configuration, source verification, and
credential-free CI. Solidity behavior and owner permissions are unchanged.

- [Deployment and hosted-testnet guide](docs/DEPLOYMENT.md)
- [NestJS + PostgreSQL architecture](docs/ARCHITECTURE.md) — local indexing, optional frontend metadata, wallet authentication and organization roles implemented.
- [Phase 1 delivery and verification](docs/PHASE_1.md)

Signing/explorer credentials belong only in an ignored root `.env` based on
`.env.example`. The frontend uses public variables from
`react-frontend/.env.example` or `.env.testnet.example`. Never supply private
deployment secrets to a static frontend host.

## Optional Phase 2A backend

The NestJS API adds PostgreSQL migrations, versioned metadata/public asset records,
readiness checks and paginated read-only endpoints. Phase 2B.1 adds an optional
local Hardhat indexing worker with verified deployment identity, reorg/reset
handling and reconciled snapshots. Without the worker, its property collection
starts empty. Fictional seed data is
explicitly isolated and contains no prices or token balances.

See [API setup and reference](docs/API.md) and
[Phase 2A delivery notes and remaining work](docs/PHASE_2A.md).
Start with `npm run setup:api`; backend configuration lives only in
`apps/api/.env`. Running the backend is optional for the existing frontend.

For worker startup, API freshness and local reset recovery, see the
[Phase 2B.1 indexing guide](docs/INDEXER.md). The worker never signs transactions;
React continues to use contract/RPC reads as its financial authority.
See [Phase 2B.1 delivery and verification](docs/PHASE_2B_1.md) for the file inventory.

Phase 2B.2 connects React to the optional API for published descriptions, images,
documents and indexer status. Enable it with `VITE_API_BASE_URL=http://127.0.0.1:3001`
in `react-frontend/.env.local`, then restart Vite. RPC still supplies every price,
supply, wallet balance and transaction input. Stale/mismatched API metadata is
withheld; API failure leaves RPC browsing and wallet actions available.
See the [full-stack CMD startup and troubleshooting guide](docs/PHASE_2B_2.md).

Phase 2C adds optional SIWE wallet sign-in, HttpOnly cookie sessions and private
organization workspaces with owner/editor/viewer permissions. Connecting a wallet,
signing in, and approving a contract transaction are separate actions. Public RPC
browsing and contract transactions continue without an API session. Organization
roles never grant contract-owner or platform-admin privileges.
See [Phase 2C setup, security decisions and API reference](docs/PHASE_2C.md).
Existing installations must run `npm run db:migrate` and use matching frontend/API
hostnames: open **http://127.0.0.1:5173** with the default authentication settings.

## BrickShare Studio — Phase 2D

Authenticated organization members can manage private fictional metadata drafts,
upload local images/documents, preview content and retain publication history.
Editors prepare content; owners explicitly publish/archive it and link verified
local-chain properties. Initial linking also requires signing in as that contract's
owner; organization roles never grant Solidity privileges. Unlinked fictional
publications stay inside Studio. Linked publications enrich the existing consumer
marketplace without changing contract prices, supply, balances or transactions.

Run the new migration with `npm run db:migrate`, restart the API/frontend, then
open **Studio** after wallet sign-in. Use **New draft → Use fictional example**
for demo content. Private local uploads live in ignored `.brickshare-storage/`;
never expose that directory through a static web server.
See [Studio setup, endpoints, security decisions and manual demo checklist](docs/PHASE_2D.md).

## How it works

```text
React frontend -> ethers.js -> MetaMask -> Hardhat blockchain -> Solidity contract
```

The contract stores listings, token balances, and purchase funds. The deployment
wallet is the administrator. The optional Phase 2A NestJS/PostgreSQL service stores
versioned presentation metadata. The frontend optionally reads published metadata
after chain/deployment/block checks and continues to work independently through
RPC if the API is disabled or unavailable.

The marketplace can read live listings through a read-only RPC without MetaMask.
Search by name/location and filter by location or availability, then open a
property for supply, price, documents and a purchase summary. Connect a wallet
for holdings, ownership percentages, purchase/transfer history and administration.
Write actions show a payment and gas estimate before opening the wallet.

An explicitly selected **Sample preview** contains fictional properties and
illustrations; it cannot transact. Live network failures never substitute sample
data. Additional photographs, descriptions and documents can be configured using
the [property metadata guide](react-frontend/PROPERTY_METADATA.md).

The redesigned interface has a dedicated overview, marketplace, property research,
portfolio and administrator workspace. See the [frontend architecture guide](react-frontend/DESIGN.md).

- The administrator adds a property with a fixed supply and a price per token.
- Investors buy tokens by sending exactly quantity times token price in ETH.
- Holders can transfer their tokens to another address.
- The administrator can withdraw all collected purchase funds.
- The administrator can enable/disable new purchases from the property management table.
  Status changes and treasury withdrawals require acknowledgement in transaction review.

Token balances use custom mappings, not ERC-20 or ERC-1155. Deactivating a listing
does not disable transfers. Each state-changing transaction requires gas.

## Requirements

- Node.js 22.19.0 or a newer Node 22 release, with npm. The version files pin
  22.19.0 as the reproducible development baseline.
- A browser with MetaMask to interact with the demo.
- Internet access on first setup for npm packages and the Solidity compiler.

Run all commands below from the repository root unless a section says otherwise.

## Install

```sh
npm run setup
npm run compile
```

Setup installs the root and React dependencies using their committed lockfiles
(`npm ci`). Compilation also synchronizes the frontend ABI with the compiled
contract. No environment variables or private keys are needed for the local demo.

## Run locally

Use three terminals, each opened in the repository root.

### Terminal 1: blockchain

```sh
npm run node
```

Keep it running. Hardhat prints funded test accounts and their private keys.
Its RPC URL is `http://127.0.0.1:8545` and chain ID is `31337`.

### Terminal 2: deployment

```sh
npm run deploy:local
```

This deploys `RealEstateTokenization` and automatically writes:

- `react-frontend/src/generated/RealEstateTokenization.abi.json`: contract ABI.
- `react-frontend/src/generated/deployment.json`: address, chain ID, transaction hash.

The ABI belongs in source control. The local deployment file is ignored because
another developer has their own blockchain. Do not edit generated files manually.

### Terminal 3: frontend

```sh
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`.

### Connect MetaMask

Add/select a custom network with these values:

| Setting         | Value                   |
| --------------- | ----------------------- |
| Name            | Hardhat Local           |
| RPC URL         | `http://127.0.0.1:8545` |
| Chain ID        | `31337`                 |
| Currency symbol | `ETH`                   |

Import Account #0 from the running Hardhat node to act as the administrator.
Import Account #1 to act as an investor. These publicly known development keys
must only be used with test funds. Connect the selected account through the app.

### Try the demo

1. As Account #0, add "Cyberjaya Condo", location "Cyberjaya", supply `1000`,
   price `0.01` ETH per token. Confirm the transaction in MetaMask.
2. Switch to Account #1, reconnect when prompted, and buy `10` tokens of
   property ID `1`. The purchase costs `0.1` test ETH plus gas.
3. Transfer `3` tokens to a different Hardhat account.
4. Switch back to Account #0 and withdraw the collected purchase funds.

Restarting the Hardhat node clears its in-memory state. Deploy again, restart
the frontend so Vite picks up the generated deployment file, and recreate the
listings. The deployment address may repeat on a fresh chain; the old data does not.

## Development commands

| Command                       | Purpose                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `npm run setup`               | Install both packages from lockfiles                                       |
| `npm run compile`             | Compile Solidity and regenerate the frontend ABI                           |
| `npm test`                    | Run the real estate contract suite on a temporary test chain               |
| `npm run test:frontend`       | Check purchase math, filters, public reads and event history               |
| `npm run test:config`         | Validate deployment guards, manifests and secret redaction                 |
| `npm run test:integration`    | Isolated localhost deployment/transaction and public-build smoke checks    |
| `npm run node`                | Run the persistent-for-the-session local blockchain                        |
| `npm run deploy:local`        | Deploy to localhost and update frontend configuration                      |
| `npm run deploy:base-sepolia` | Deploy with a dedicated test wallet; write the public testnet manifest     |
| `npm run verify:base-sepolia` | Verify the recorded Base Sepolia source without redeploying                |
| `npm run dev`                 | Start the React development server                                         |
| `npm run dev:testnet`         | Preview Base Sepolia using public testnet configuration                    |
| `npm run build`               | Build the React frontend into `react-frontend/dist/`                       |
| `npm run build:testnet`       | Build the hosted demo; fail if testnet deployment configuration is missing |
| `npm run preview`             | Preview the existing frontend production build                             |

After a Solidity change, compile, test, and redeploy before using the frontend.
Builds work without a local deployment, but wallet actions require deployment.
For a production-build demo, deploy before building; deployment metadata is
embedded in the frontend bundle at build time.

The contract deployment tooling uses ethers v6 through Hardhat, while the React application
uses ethers v5. Keep dependencies in their respective packages.

The default network is localhost, with read-only RPC `http://127.0.0.1:8545`.
Use `VITE_NETWORK=baseSepolia` or testnet mode for the public demo. Override
`VITE_RPC_URL` in the matching frontend env file if needed. Testnet builds use
their own manifest or explicit address/deployment block, never localhost's record.
Vite variables are public browser configuration; do not put private credentials
in them. A hosted demo needs a browser-accessible HTTPS RPC for its deployed
network; localhost refers to each visitor's own machine.

The optional Ignition module is `ignition/modules/RealEstateTokenization.js`.
It retains the existing module ID for compatibility with earlier journals.
The documented `deploy:local` script is the supported frontend workflow; a direct
Ignition deployment does not synchronize frontend configuration.

## Repository layout

```text
contracts/                 Solidity contract
scripts/                   Deployment and frontend configuration generation
config/                    Public network registry and Node-only deployment configuration
deployments/               Reviewed public testnet deployment records (once deployed)
docs/                      Deployment, architecture, API setup and delivery notes
apps/api/                  Optional NestJS + PostgreSQL metadata foundation
compose.yaml               Local PostgreSQL 16 (backend only)
.github/workflows/         Tests/builds only; no automatic deployment or secrets
test/                      Active real estate contract tests
ignition/modules/          Optional Ignition deployment module
react-frontend/            Main React + Vite application
  src/generated/           Generated ABI and local deployment metadata
archive/                   Historical HTML frontends and unused sample test
```

Commit all three `package-lock.json` files and the generated ABI. Dependency folders,
build output, Hardhat artifacts/cache, and local deployment state are ignored.
After intentionally changing dependencies, update the relevant lockfile with
`npm install` in that package.

## Troubleshooting

- **Contract not deployed:** start the node, run `npm run deploy:local`, then
  restart the frontend. No address copying is needed.
- **Wrong network or connection failure:** select chain `31337` in MetaMask,
  confirm the node is running, and redeploy if the node was restarted.
- **Owner buttons disabled:** connect the wallet that deployed the contract
  (Account #0 in the default workflow).
- **Balances or listings look stale:** use Refresh; account/network changes clear
  the connected wallet context and require reconnecting.
- **Nonce errors after resetting the local chain:** clear MetaMask's activity/nonce
  data for the development account and reconnect to the local network.
- **Port in use:** use Vite's printed URL. The local blockchain must be available
  on port `8545` for the default deployment command.

The archived implementations are historical references and are not part of the
supported setup or active test suite. See [archive/README.md](archive/README.md).
