const fs = require("node:fs");
const path = require("node:path");
const { Wallet, getAddress } = require("ethers");
const networks = require("./networks.json");

const projectRoot = path.resolve(__dirname, "..");

function loadDeploymentEnv() {
  const filename = path.join(projectRoot, ".env");
  if (fs.existsSync(filename)) process.loadEnvFile(filename);
}

function deploymentAccounts(env = process.env) {
  const key = env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!key) return [];
  try {
    if (!/^0x[0-9a-f]{64}$/i.test(key)) throw new Error();
    new Wallet(key);
    return [key];
  } catch {
    // Never let an underlying key-validation error echo its value to logs.
    throw new Error(
      "DEPLOYER_PRIVATE_KEY must be a valid 0x-prefixed 32-byte test-wallet key."
    );
  }
}

function deploymentRpc(env = process.env) {
  const rpc = env.BASE_SEPOLIA_RPC_URL?.trim() || networks.baseSepolia.rpcUrl;
  try {
    if (new URL(rpc).protocol !== "https:") throw new Error();
    return rpc;
  } catch {
    throw new Error(
      "BASE_SEPOLIA_RPC_URL must be an HTTPS Base Sepolia RPC endpoint."
    );
  }
}

function assertDeploymentNetwork(name, chainId) {
  const network = networks[name];
  if (!network || network.chainId !== Number(chainId)) {
    throw new Error(
      "Deployment is limited to localhost (31337) and Base Sepolia (84532), with a matching RPC chain ID."
    );
  }
  return network;
}

function validateDeploymentRecord(record, networkName) {
  assertDeploymentNetwork(networkName, record?.chainId);
  let address;
  try {
    address = getAddress(record.address);
  } catch {
    throw new Error("Deployment record has an invalid contract address.");
  }
  if (/^0x0{40}$/i.test(address))
    throw new Error("Deployment address cannot be zero.");
  if (!Number.isSafeInteger(record.blockNumber) || record.blockNumber < 0)
    throw new Error(
      "Deployment record requires a nonnegative, safe integer blockNumber."
    );
  if (!/^0x[0-9a-f]{64}$/i.test(record.transactionHash || ""))
    throw new Error("Deployment record requires a transaction hash.");
  return { ...record, address };
}

function publicDeploymentPath(networkName) {
  if (networkName !== "baseSepolia")
    throw new Error("Only Base Sepolia has a shared public deployment record.");
  return path.join(projectRoot, "deployments", "baseSepolia.json");
}

function safeDeploymentError(error, env = process.env) {
  let message = String(
    error?.shortMessage ||
      error?.reason ||
      error?.message ||
      "Deployment operation failed."
  );
  for (const name of [
    "DEPLOYER_PRIVATE_KEY",
    "BASE_SEPOLIA_RPC_URL",
    "ETHERSCAN_API_KEY",
  ]) {
    const value = env[name]?.trim();
    if (value)
      message = message
        .replaceAll(value, "[redacted]")
        .replaceAll(encodeURIComponent(value), "[redacted]");
  }
  return message;
}

module.exports = {
  networks,
  loadDeploymentEnv,
  deploymentAccounts,
  deploymentRpc,
  assertDeploymentNetwork,
  validateDeploymentRecord,
  publicDeploymentPath,
  safeDeploymentError,
};
