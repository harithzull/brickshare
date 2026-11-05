const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");
const { syncAbi, writeGeneratedJson } = require("./sync-frontend");
const {
  assertDeploymentNetwork,
  validateDeploymentRecord,
  publicDeploymentPath,
  safeDeploymentError,
} = require("../config/deployment");

async function main() {
  if (hre.network.name === "hardhat") {
    throw new Error(
      "Use npm run deploy:local with npm run node running in another terminal. The default Hardhat network is temporary."
    );
  }
  assertDeploymentNetwork(hre.network.name, hre.network.config.chainId);
  if (
    hre.network.name === "baseSepolia" &&
    !hre.network.config.accounts.length
  ) {
    throw new Error(
      "Set DEPLOYER_PRIVATE_KEY in root .env to a dedicated Base Sepolia test-wallet key before deploying."
    );
  }
  const { chainId } = await hre.ethers.provider.getNetwork();
  const network = assertDeploymentNetwork(hre.network.name, chainId);
  const [deployer] = await hre.ethers.getSigners();
  if (
    !deployer ||
    (await hre.ethers.provider.getBalance(deployer.address)) === 0n
  ) {
    throw new Error(
      "The deployment wallet needs test ETH on the selected network for gas."
    );
  }
  const RealEstateTokenization = await hre.ethers.getContractFactory(
    "RealEstateTokenization"
  );
  const contract = await RealEstateTokenization.deploy();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const receipt = await contract.deploymentTransaction().wait();
  const artifact = await hre.artifacts.readArtifact("RealEstateTokenization");
  const record = validateDeploymentRecord(
    {
      contractName: "RealEstateTokenization",
      network: hre.network.name,
      address,
      chainId: Number(chainId),
      blockNumber: receipt.blockNumber,
      transactionHash: receipt.hash,
      deployer: deployer.address,
      compilerVersion: "0.8.19",
      deployedBytecodeHash: hre.ethers.keccak256(artifact.deployedBytecode),
    },
    hre.network.name
  );
  syncAbi();
  if (hre.network.name === "localhost") {
    writeGeneratedJson("deployment.json", record);
  } else {
    const filename = publicDeploymentPath(hre.network.name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(record, null, 2) + "\n");
    console.log(
      "Public deployment record saved to deployments/baseSepolia.json. Review it before committing."
    );
    console.log(
      "Contract explorer:",
      `${network.explorerUrl}/address/${address}`
    );
  }

  console.log("RealEstateTokenization deployed to:", address);
  console.log("Chain ID:", chainId.toString());
  console.log(
    "Frontend ABI and the selected network's deployment configuration updated."
  );
}

main().catch((error) => {
  console.error("Deployment failed:", safeDeploymentError(error));
  process.exitCode = 1;
});
