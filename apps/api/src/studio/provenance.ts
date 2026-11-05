import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EntityManager } from "typeorm";
import { Interface, keccak256 } from "ethers";
import { Environment } from "../config/environment";
import {
  LocalRpc,
  instanceId,
  blockAt,
  hash,
  address,
  quantity,
  tag,
} from "../indexer/rpc";

const abi = new Interface([
  "function owner() view returns (address)",
  "function getProperty(uint256) view returns (uint256,string,string,uint256,uint256,uint256,bool)",
]);
const hex = (value: Buffer) => "0x" + value.toString("hex");
@Injectable()
export class StudioProvenance {
  constructor(private readonly config: ConfigService) {}
  async check(
    manager: EntityManager,
    propertyId: string,
    claimant?: { address: string; chainId: string },
  ) {
    const [row] = await manager.query(
      `SELECT p.*,d.address,d.owner_address,i.active AS instance_active,i.hardhat_instance_id,i.genesis_hash,i.runtime_hash,i.deployment_block,i.deployment_block_hash,i.transaction_hash,c.chain_id,s.status,s.last_success_at,s.last_scanned_block,s.last_scanned_hash
      FROM properties p JOIN contract_deployments d ON d.id=p.deployment_id JOIN chains c ON c.id=d.chain_id JOIN deployment_instances i ON i.id=p.deployment_instance_id JOIN indexer_cursors s ON s.instance_id=i.id WHERE p.id=$1`,
      [propertyId],
    );
    const env = this.config.getOrThrow<Environment>("validated");
    if (
      !row ||
      row.source !== "blockchain" ||
      row.chain_id !== "31337" ||
      !row.canonical_snapshot ||
      !row.instance_active ||
      row.status !== "synced" ||
      !row.last_success_at ||
      Date.now() - row.last_success_at.getTime() > env.INDEXER_STALE_AFTER_MS ||
      row.observed_block !== row.last_scanned_block ||
      !row.observed_block_hash.equals(row.last_scanned_hash)
    )
      throw new ConflictException(
        "Property is not a fresh verified local-chain observation. Start the indexer; do not reuse old reset identities.",
      );
    const rpc = new LocalRpc(env.STUDIO_RPC_URL, 2500);
    try {
      const run = await instanceId(rpc);
      const [
        genesis,
        deployment,
        observed,
        receipt,
        code,
        ownerData,
        propertyData,
      ] = await Promise.all([
        blockAt(rpc, 0n),
        blockAt(rpc, BigInt(row.deployment_block)),
        blockAt(rpc, BigInt(row.observed_block)),
        rpc.request<any>("eth_getTransactionReceipt", [
          hex(row.transaction_hash),
        ]),
        rpc.request<string>("eth_getCode", [hex(row.address), "latest"]),
        rpc.request<string>("eth_call", [
          { to: hex(row.address), data: abi.encodeFunctionData("owner") },
          tag(BigInt(row.observed_block)),
        ]),
        rpc.request<string>("eth_call", [
          {
            to: hex(row.address),
            data: abi.encodeFunctionData("getProperty", [row.on_chain_id]),
          },
          tag(BigInt(row.observed_block)),
        ]),
      ]);
      if (
        run !== hex(row.hardhat_instance_id) ||
        genesis?.hash !== hex(row.genesis_hash) ||
        deployment?.hash !== hex(row.deployment_block_hash) ||
        observed?.hash !== hex(row.observed_block_hash) ||
        !receipt ||
        quantity(receipt.status) !== 1n ||
        address(receipt.contractAddress) !== hex(row.address) ||
        hash(receipt.transactionHash) !== hex(row.transaction_hash) ||
        hash(receipt.blockHash) !== hex(row.deployment_block_hash) ||
        quantity(receipt.blockNumber) !== BigInt(row.deployment_block) ||
        address(receipt.from) !== hex(row.owner_address) ||
        keccak256(code) !== hex(row.runtime_hash) ||
        abi.decodeFunctionResult("getProperty", propertyData)[0].toString() !==
          row.on_chain_id ||
        address(abi.decodeFunctionResult("owner", ownerData)[0]) !==
          hex(row.owner_address) ||
        (await instanceId(rpc)) !== run
      )
        throw new Error();
    } catch {
      throw new ConflictException(
        "Deployment or canonical block verification failed. Check RPC/indexer and local reset recovery.",
      );
    }
    if (
      claimant &&
      (claimant.chainId !== row.chain_id ||
        claimant.address.toLowerCase() !== hex(row.owner_address))
    )
      throw new ForbiddenException(
        "Initial association requires an organization owner signed in as this verified contract owner on its chain",
      );
    return row;
  }
}
