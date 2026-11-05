# Public testnet deployments

`npm run deploy:base-sepolia` writes `baseSepolia.json` here only after a
successful transaction. The record contains the public contract address, chain
ID, deployment block/transaction, deployer address, compiler version, and a
deployed-bytecode hash. Review and commit that public record for reproducible
testnet frontend builds. There is no fabricated address in the repository.

Keep the Solidity source and compiler settings used for each release. Commit
the record with that release; verification checks it against the on-chain code.
Localhost continues to use the ignored frontend-generated `deployment.json` and
never overwrites this testnet record. Never put private keys, RPC credentials,
or explorer API keys in deployment records.
