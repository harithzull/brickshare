const test = require("node:test");
const assert = require("node:assert/strict");
const { Wallet } = require("ethers");
const {
  deploymentAccounts,
  deploymentRpc,
  assertDeploymentNetwork,
  validateDeploymentRecord,
  publicDeploymentPath,
  safeDeploymentError,
} = require("../../config/deployment");

test("local configuration needs no secrets; public deployment accounts are explicit", () => {
  assert.deepEqual(deploymentAccounts({}), []);
  const ephemeralKey = Wallet.createRandom().privateKey;
  assert.deepEqual(deploymentAccounts({ DEPLOYER_PRIVATE_KEY: ephemeralKey }), [
    ephemeralKey,
  ]);
  assert.throws(
    () => deploymentAccounts({ DEPLOYER_PRIVATE_KEY: "not-a-key" }),
    /valid.*test-wallet/
  );
  assert.throws(
    () => deploymentAccounts({ DEPLOYER_PRIVATE_KEY: "0x" + "0".repeat(64) }),
    /valid.*test-wallet/
  );
});

test("deployment allows only matching local and Base Sepolia networks", () => {
  assert.equal(assertDeploymentNetwork("localhost", 31337n).chainId, 31337);
  assert.equal(assertDeploymentNetwork("baseSepolia", 84532n).chainId, 84532);
  for (const [name, chainId] of [
    ["mainnet", 1],
    ["base", 8453],
    ["baseSepolia", 8453],
    ["localhost", 84532],
    ["../baseSepolia", 84532],
  ]) {
    assert.throws(() => assertDeploymentNetwork(name, chainId), /limited/);
  }
});

test("deployment RPC configuration is HTTPS and errors do not reveal input", () => {
  assert.equal(deploymentRpc({}), "https://sepolia.base.org");
  assert.throws(
    () =>
      deploymentRpc({
        BASE_SEPOLIA_RPC_URL: "http://example.invalid/private-value",
      }),
    (error) => !error.message.includes("private-value")
  );
});

test("public manifests validate chain, address, block and transaction identity", () => {
  const record = {
    chainId: 84532,
    address: "0x1111111111111111111111111111111111111111",
    blockNumber: 123,
    transactionHash: "0x" + "a".repeat(64),
  };
  assert.equal(
    validateDeploymentRecord(record, "baseSepolia").blockNumber,
    123
  );
  for (const change of [
    { chainId: 8453 },
    { address: "0x" + "0".repeat(40) },
    { blockNumber: -1 },
    { blockNumber: Number.MAX_SAFE_INTEGER + 1 },
    { transactionHash: "invalid" },
  ]) {
    assert.throws(() =>
      validateDeploymentRecord({ ...record, ...change }, "baseSepolia")
    );
  }
  assert.match(
    publicDeploymentPath("baseSepolia"),
    /deployments[/\\]baseSepolia\.json$/
  );
  assert.throws(() => publicDeploymentPath("localhost"));
});

test("deployment failures redact signing and API configuration", () => {
  const env = {
    DEPLOYER_PRIVATE_KEY: "ephemeral-secret-marker",
    ETHERSCAN_API_KEY: "explorer-secret-marker",
    BASE_SEPOLIA_RPC_URL: "https://example.invalid/rpc-secret-marker",
  };
  const output = safeDeploymentError(
    new Error(
      Object.values(env).join(" ") +
        " " +
        encodeURIComponent(env.BASE_SEPOLIA_RPC_URL)
    ),
    env
  );
  for (const value of Object.values(env))
    assert.equal(output.includes(value), false);
  assert.equal(output.includes("rpc-secret-marker"), false);
});
