import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  resolveChainConfig,
  switchToConfiguredChain,
} from "../src/lib/chain-config.js";
const require = createRequire(import.meta.url);
const networks = require("../../config/networks.json");
const address = "0x1111111111111111111111111111111111111111";
const local = { address, chainId: 31337, blockNumber: 1 };
const base = { address, chainId: 84532, blockNumber: 1234 };
const resolve = (options = {}) => resolveChainConfig({ networks, ...options });

test("unknown Base Sepolia wallet network is added and then explicitly selected", async () => {
  const config = resolve({
    mode: "testnet",
    deployments: { baseSepolia: base },
  });
  const requests = [];
  const wallet = {
    request: async (request) => {
      requests.push(request);
      if (requests.length === 1)
        throw Object.assign(new Error("Unknown network"), { code: 4902 });
      return null;
    },
  };
  await switchToConfiguredChain(wallet, config.walletParameters);
  assert.deepEqual(
    requests.map((request) => request.method),
    [
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
    ]
  );
  assert.deepEqual(requests[1].params, [config.walletParameters]);
  assert.deepEqual(requests[2].params, [{ chainId: "0x14a34" }]);
});

test("wallet network rejection propagates without adding or falsely selecting a network", async () => {
  const requests = [];
  const error = Object.assign(new Error("User rejected request"), {
    code: 4001,
  });
  await assert.rejects(
    switchToConfiguredChain(
      {
        request: async (request) => {
          requests.push(request);
          throw error;
        },
      },
      { chainId: "0x14a34" }
    ),
    (result) => result === error
  );
  assert.equal(requests.length, 1);
});

test("fresh localhost builds support sample browsing without credentials or a deployment", () => {
  const config = resolve();
  assert.equal(config.chainId, 31337);
  assert.equal(config.address, null);
  assert.equal(config.rpcUrl, "http://127.0.0.1:8545");
  assert.equal(
    resolve({ deployments: { localhost: local, baseSepolia: base } })
      .blockNumber,
    1
  );
});

test("Base Sepolia selects only its own manifest and provides wallet onboarding", () => {
  const config = resolve({
    env: { VITE_NETWORK: "baseSepolia" },
    deployments: { localhost: local, baseSepolia: base },
  });
  assert.equal(config.chainId, 84532);
  assert.equal(config.blockNumber, 1234);
  assert.equal(config.walletParameters.chainId, "0x14a34");
  assert.deepEqual(config.walletParameters.blockExplorerUrls, [
    "https://sepolia.basescan.org",
  ]);
  assert.equal(config.walletParameters.nativeCurrency.symbol, "ETH");
});

test("a public testnet build never falls back to localhost", () => {
  assert.throws(
    () => resolve({ mode: "testnet", deployments: { localhost: local } }),
    /real deployed address/
  );
  assert.throws(
    () => resolve({ mode: "testnet", env: { VITE_NETWORK: "localhost" } }),
    /requires.*baseSepolia/
  );
  assert.throws(
    () =>
      resolve({
        env: { VITE_NETWORK: "baseSepolia" },
        deployments: { baseSepolia: local },
      }),
    /chainId/
  );
  for (const name of ["base", "mainnet", "8453", "__proto__"])
    assert.throws(
      () => resolve({ env: { VITE_NETWORK: name } }),
      /not supported/
    );
});

test("public address overrides require matching event-history configuration", () => {
  const env = {
    VITE_NETWORK: "baseSepolia",
    VITE_CONTRACT_ADDRESS: address,
    VITE_DEPLOYMENT_BLOCK: "2000",
  };
  assert.equal(resolve({ env }).blockNumber, 2000);
  assert.throws(
    () => resolve({ env: { ...env, VITE_DEPLOYMENT_BLOCK: "" } }),
    /bound event-history/
  );
  for (const block of ["-1", "1.5", "1e6", "0", "9007199254740992"])
    assert.throws(() =>
      resolve({ env: { ...env, VITE_DEPLOYMENT_BLOCK: block } })
    );
  assert.throws(
    () =>
      resolve({
        env: { ...env, VITE_CONTRACT_ADDRESS: "0x" + "0".repeat(40) },
      }),
    /zero/
  );
  assert.throws(
    () => resolve({ env: { ...env, VITE_CONTRACT_ADDRESS: "bad" } }),
    /invalid address/
  );
});

test("hosted builds enforce HTTPS and reject common frontend-secret mistakes", () => {
  const options = { mode: "testnet", deployments: { baseSepolia: base } };
  for (const rpc of [
    "http://127.0.0.1:8545",
    "https://localhost/rpc",
    "https://user:password@example.invalid",
    "javascript:alert(1)",
  ]) {
    assert.throws(
      () => resolve({ ...options, env: { VITE_RPC_URL: rpc } }),
      /browser-safe/
    );
  }
  for (const name of [
    "VITE_DEPLOYER_PRIVATE_KEY",
    "VITE_ETHERSCAN_API_KEY",
    "VITE_MNEMONIC",
  ]) {
    assert.throws(
      () => resolve({ ...options, env: { [name]: "not-a-real-secret" } }),
      /must never/
    );
  }
});
