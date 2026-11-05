const fs = require("node:fs");
const hre = require("hardhat");
const {
  assertDeploymentNetwork,
  publicDeploymentPath,
  validateDeploymentRecord,
  safeDeploymentError,
} = require("../config/deployment");

async function main() {
  if (hre.network.name !== "baseSepolia")
    throw new Error("Verification is configured only for Base Sepolia.");
  if (!process.env.ETHERSCAN_API_KEY?.trim())
    throw new Error(
      "Set ETHERSCAN_API_KEY in root .env for Etherscan V2 verification."
    );
  const { chainId } = await hre.ethers.provider.getNetwork();
  assertDeploymentNetwork(hre.network.name, chainId);
  const filename = publicDeploymentPath(hre.network.name);
  if (!fs.existsSync(filename))
    throw new Error(
      "No Base Sepolia record exists. Deploy once before verifying; verification does not redeploy."
    );
  const record = validateDeploymentRecord(
    JSON.parse(fs.readFileSync(filename, "utf8")),
    hre.network.name
  );
  const artifact = await hre.artifacts.readArtifact("RealEstateTokenization");
  const expectedHash = hre.ethers.keccak256(artifact.deployedBytecode);
  const code = await hre.ethers.provider.getCode(record.address);
  if (
    code === "0x" ||
    hre.ethers.keccak256(code) !== expectedHash ||
    record.deployedBytecodeHash !== expectedHash
  ) {
    throw new Error(
      "Recorded deployment, on-chain bytecode, and local artifact must match before verification. Restore the source used at deployment; do not redeploy merely to retry verification."
    );
  }
  try {
    await hre.run("verify:verify", {
      address: record.address,
      constructorArguments: [],
      contract: "contracts/RealEstateTokenization.sol:RealEstateTokenization",
    });
  } catch (error) {
    if (!/already verified/i.test(error.message || "")) throw error;
    console.log("Contract source is already verified.");
  }
  console.log(
    "Verification complete:",
    `https://sepolia.basescan.org/address/${record.address}#code`
  );
}

main().catch((error) => {
  console.error("Verification failed:", safeDeploymentError(error));
  process.exitCode = 1;
});
