const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { ethers } = require("ethers");
const root = path.resolve(__dirname, "../..");
const hardhat = path.join(root, "node_modules/hardhat/internal/cli/cli.js");
const vite = path.join(root, "react-frontend/node_modules/vite/bin/vite.js");
const localFile = path.join(
  root,
  "react-frontend/src/generated/deployment.json"
);
const baseFile = path.join(root, "deployments/baseSepolia.json");
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file) : null);
const originalLocal = read(localFile);
const originalBase = read(baseFile);
const cleanEnv = {
  ...process.env,
  DEPLOYER_PRIVATE_KEY: "",
  ETHERSCAN_API_KEY: "",
};
for (const key of Object.keys(cleanEnv))
  if (key.startsWith("VITE_")) delete cleanEnv[key];
let node;
let provider;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function run(args, env = {}, cwd = root) {
  return spawnSync(process.execPath, args, {
    cwd,
    env: { ...cleanEnv, ...env },
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 2 * 1024 * 1024,
  });
}
async function main() {
  const missingKey = run(
    [hardhat, "run", "scripts/deploy.js", "--network", "baseSepolia"],
    { BASE_SEPOLIA_RPC_URL: "https://example.invalid" }
  );
  assert.notEqual(missingKey.status, 0);
  assert.match(
    missingKey.stdout + missingKey.stderr,
    /Set DEPLOYER_PRIVATE_KEY/
  );
  const missingApi = run(
    [hardhat, "run", "scripts/verify.js", "--network", "baseSepolia"],
    { BASE_SEPOLIA_RPC_URL: "https://example.invalid" }
  );
  assert.notEqual(missingApi.status, 0);
  assert.match(missingApi.stdout + missingApi.stderr, /Set ETHERSCAN_API_KEY/);
  console.log(
    "PASS: missing deployment/verification secrets fail before contacting an RPC."
  );

  try {
    await fetch("http://127.0.0.1:18545", { signal: AbortSignal.timeout(500) });
    throw new Error("QA port already in use; not touching it.");
  } catch (error) {
    if (error.message.includes("already in use")) throw error;
  }
  const logPath = path.join(
    os.tmpdir(),
    `brickshare-phase1-node-${Date.now()}.log`
  );
  const log = fs.openSync(logPath, "a");
  node = spawn(
    process.execPath,
    [hardhat, "node", "--hostname", "127.0.0.1", "--port", "18545"],
    { cwd: root, env: cleanEnv, windowsHide: true, stdio: ["ignore", log, log] }
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      await fetch("http://127.0.0.1:18545");
      ready = true;
      break;
    } catch {
      await delay(200);
    }
  }
  assert.equal(ready, true, `Temporary node failed; log at ${logPath}`);
  const deployed = run(
    [hardhat, "run", "scripts/deploy.js", "--network", "localhost"],
    { LOCALHOST_RPC_URL: "http://127.0.0.1:18545" }
  );
  assert.equal(deployed.status, 0, deployed.stdout + deployed.stderr);
  const record = JSON.parse(fs.readFileSync(localFile, "utf8"));
  assert.equal(record.chainId, 31337);
  assert.ok(record.blockNumber > 0);
  provider = new ethers.JsonRpcProvider("http://127.0.0.1:18545");
  const owner = await provider.getSigner(0);
  const buyer = await provider.getSigner(1);
  const receiver = await (await provider.getSigner(2)).getAddress();
  const artifact = require(path.join(
    root,
    "artifacts/contracts/RealEstateTokenization.sol/RealEstateTokenization.json"
  ));
  const contract = new ethers.Contract(record.address, artifact.abi, owner);
  assert.equal(await contract.owner(), await owner.getAddress());
  assert.equal(
    ethers.keccak256(await provider.getCode(record.address)),
    record.deployedBytecodeHash
  );
  await (
    await contract.addProperty(
      "Phase 1 local smoke",
      "Local test",
      1000,
      ethers.parseEther("0.01")
    )
  ).wait();
  await (
    await contract
      .connect(buyer)
      .buyTokens(1, 2, { value: ethers.parseEther("0.02") })
  ).wait();
  await (await contract.connect(buyer).transferTokens(1, receiver, 1)).wait();
  await (await contract.withdrawFunds()).wait();
  assert.equal(await contract.getTokenBalance(1, await buyer.getAddress()), 1n);
  assert.equal(await contract.getTokenBalance(1, receiver), 1n);
  assert.equal(await provider.getBalance(record.address), 0n);
  assert.deepEqual(read(baseFile), originalBase);
  console.log(
    "PASS: localhost deployment, manifest/hash/owner, purchases, transfers and withdrawal; Base Sepolia record unchanged."
  );

  // Restore real local state before build checks; never persist synthetic Base records.
  if (originalLocal) fs.writeFileSync(localFile, originalLocal);
  else fs.unlinkSync(localFile);
  const missingBuild = run(
    [vite, "build", "--mode", "testnet"],
    // Override local Vite files as well as process env: an opt-in localhost API
    // must not mask the missing Base deployment check in this testnet fixture.
    { VITE_API_BASE_URL: "" },
    path.join(root, "react-frontend")
  );
  if (!originalBase) {
    assert.notEqual(missingBuild.status, 0);
    assert.match(
      missingBuild.stdout + missingBuild.stderr,
      /Base Sepolia|baseSepolia/
    );
    console.log(
      "PASS: an unconfigured public testnet build fails instead of using localhost."
    );
  }
  const canary = "BRICKSHARE_PRIVATE_ENV_CANARY_NOT_A_KEY";
  const validBuild = run(
    [vite, "build", "--mode", "testnet"],
    {
      VITE_NETWORK: "baseSepolia",
      VITE_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111",
      VITE_DEPLOYMENT_BLOCK: "1",
      VITE_RPC_URL: "https://sepolia.base.org",
      VITE_API_BASE_URL: "",
      DEPLOYER_PRIVATE_KEY: canary,
      ETHERSCAN_API_KEY: canary,
      BASE_SEPOLIA_RPC_URL: canary,
    },
    path.join(root, "react-frontend")
  );
  assert.equal(validBuild.status, 0, validBuild.stdout + validBuild.stderr);
  const checkBundle = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) checkBundle(file);
      else if (/\.(js|html|css|json)$/.test(file))
        assert.equal(
          fs.readFileSync(file, "utf8").includes(canary),
          false,
          "A private process variable leaked into the client bundle"
        );
    }
  };
  checkBundle(path.join(root, "react-frontend/dist"));
  console.log(
    "PASS: Base Sepolia-mode production build with public fixture; private process canaries absent from output. No public transactions sent."
  );
  const defaultBuild = run(
    [vite, "build"],
    {},
    path.join(root, "react-frontend")
  );
  assert.equal(
    defaultBuild.status,
    0,
    defaultBuild.stdout + defaultBuild.stderr
  );
  console.log(
    "PASS: restored the default frontend build after testnet fixture checks."
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    node?.kill();
    provider?.destroy();
    if (originalLocal) fs.writeFileSync(localFile, originalLocal);
    else if (fs.existsSync(localFile)) fs.unlinkSync(localFile);
  });
