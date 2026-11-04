const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const generatedDirectory = path.join(projectRoot, "react-frontend", "src", "generated");

function writeGeneratedJson(filename, value) {
  fs.mkdirSync(generatedDirectory, { recursive: true });
  fs.writeFileSync(path.join(generatedDirectory, filename), JSON.stringify(value, null, 2) + "\n");
}

function syncAbi() {
  const artifactPath = path.join(
    projectRoot, "artifacts", "contracts", "RealEstateTokenization.sol", "RealEstateTokenization.json"
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error("Contract artifact missing. Run npm run compile from the project root.");
  }
  const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  writeGeneratedJson("RealEstateTokenization.abi.json", abi);
}

module.exports = { syncAbi, writeGeneratedJson };

if (require.main === module) {
  syncAbi();
  console.log("Frontend ABI synchronized from the compiled contract.");
}
