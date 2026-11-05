import { readFileSync } from 'node:fs';
import { Interface, keccak256, toUtf8Bytes, getCreateAddress } from 'ethers';
import { IndexerSettings } from './config';
import { address, blockAt, ensure, hash, instanceId, quantity, Rpc, tag } from './rpc';

export interface Target {
  address: string; transactionHash: string; deployer: string; deploymentBlock: bigint;
  runtimeHash: string; creationBytecode: string; abi: Interface; abiHash: string;
}
export function loadTarget(settings: IndexerSettings): Target {
  try {
    const manifest = JSON.parse(readFileSync(settings.manifestPath, 'utf8'));
    const artifact = JSON.parse(readFileSync(settings.artifactPath, 'utf8'));
    const committedAbi = new Interface(JSON.parse(readFileSync(settings.abiPath, 'utf8')));
    const abi = new Interface(artifact.abi);
    ensure(manifest.contractName === 'RealEstateTokenization' && manifest.network === 'localhost' && manifest.chainId === 31337 && manifest.compilerVersion === '0.8.19');
    ensure(artifact.contractName === 'RealEstateTokenization' && abi.formatJson() === committedAbi.formatJson());
    ensure(Number.isSafeInteger(manifest.blockNumber) && manifest.blockNumber > 0);
    ensure(/^0x[0-9a-fA-F]+$/.test(artifact.bytecode));
    const runtimeHash = hash(manifest.deployedBytecodeHash);
    ensure(keccak256(artifact.deployedBytecode) === runtimeHash);
    return { address: address(manifest.address), transactionHash: hash(manifest.transactionHash), deployer: address(manifest.deployer), deploymentBlock: BigInt(manifest.blockNumber), runtimeHash, creationBytecode: artifact.bytecode.toLowerCase(), abi, abiHash: keccak256(toUtf8Bytes(abi.formatJson())) };
  } catch { throw new Error('Deployment provenance is missing or inconsistent. Compile and review the local deployment manifest/artifact. Values redacted.'); }
}
export async function verifyTarget(rpc: Rpc, target: Target) {
  const runId = await instanceId(rpc);
  const genesis = await blockAt(rpc, 0n);
  const deployment = await blockAt(rpc, target.deploymentBlock);
  const receipt = await rpc.request<any>('eth_getTransactionReceipt', [target.transactionHash]);
  const tx = await rpc.request<any>('eth_getTransactionByHash', [target.transactionHash]);
  ensure(genesis && deployment && receipt && tx);
  ensure(quantity(receipt.status) === 1n && address(receipt.contractAddress) === target.address && address(receipt.from) === target.deployer);
  ensure(hash(receipt.transactionHash) === target.transactionHash && hash(receipt.blockHash) === deployment.hash && quantity(receipt.blockNumber) === deployment.number);
  ensure(tx.to === null && hash(tx.hash) === target.transactionHash && address(tx.from) === target.deployer && hash(tx.blockHash) === deployment.hash && quantity(tx.blockNumber) === deployment.number);
  ensure(tx.input.toLowerCase() === target.creationBytecode && getCreateAddress({ from: tx.from, nonce: quantity(tx.nonce) }).toLowerCase() === target.address);
  for (const block of [tag(deployment.number), 'latest']) {
    const code = await rpc.request<string>('eth_getCode', [target.address, block]);
    ensure(code !== '0x' && keccak256(code) === target.runtimeHash);
  }
  const ownerData = await rpc.request<string>('eth_call', [{ to: target.address, data: target.abi.encodeFunctionData('owner') }, tag(deployment.number)]);
  ensure(address(target.abi.decodeFunctionResult('owner', ownerData)[0]) === target.deployer);
  ensure(await instanceId(rpc) === runId, 'batch_changed');
  return { runId, genesis, deployment, fingerprint: keccak256(toUtf8Bytes([runId, genesis.hash, deployment.hash, target.transactionHash, target.runtimeHash].join(':'))) };
}
