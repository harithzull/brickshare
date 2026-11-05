# BrickShare API

Optional NestJS modular monolith for BrickShare Invest and Studio. It does not sign
transactions or hold funds. The optional Phase 2B.1 worker reconciles local chain
snapshots; see [indexer startup and recovery](../../docs/INDEXER.md).

See [setup and HTTP API reference](../../docs/API.md),
[architecture](../../docs/ARCHITECTURE.md) and
[Phase 2A delivery notes](../../docs/PHASE_2A.md).

From the repository root:

```sh
npm run setup:api
# Copy apps/api/.env.example to apps/api/.env and configure the local DB password.
docker compose --env-file apps/api/.env up -d postgres
npm run db:migrate
npm run db:seed:networks
npm run dev:api
```

`npm run build:api` compiles TypeScript and copies the reviewed SQL migration files.
`npm run start:api` starts the compiled service. `npm run test:api` needs no database;
`npm run test:api:db` requires a separate `TEST_DATABASE_URL` database ending in
`_test`. The test runner never falls back to the application's `DATABASE_URL`.
