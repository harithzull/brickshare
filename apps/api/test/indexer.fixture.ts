import { Interface, getCreateAddress, keccak256, toUtf8Bytes } from 'ethers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiRoot } from '../src/config/environment';
import { Target } from '../src/indexer/identity';
import { Rpc, tag } from '../src/indexer/rpc';

export const digest = (value: string) => keccak256(toUtf8Bytes(value));
export const owner = '0x1111111111111111111111111111111111111111';
export const buyer = '0x2222222222222222222222222222222222222222';
export const recipient = '0x3333333333333333333333333333333333333333';
const abi = new Interface(JSON.parse(readFileSync(join(apiRoot, '../../react-frontend/src/generated/RealEstateTokenization.abi.json'), 'utf8')));
export function fixtureTarget(): Target {
  return { address: getCreateAddress({ from: owner, nonce: 0 }).toLowerCase(), transactionHash: digest('deployment'), deployer: owner, deploymentBlock: 1n, runtimeHash: keccak256('0x6000'), creationBytecode: '0x60006000', abi, abiHash: keccak256(toUtf8Bytes(abi.formatJson())) };
}
interface WorldProperty { name: string; location: string; total: bigint; available: bigint; price: bigint; active: boolean; holders: Record<string, bigint>; }
interface World { properties: Record<string, WorldProperty>; balance: bigint; }
export class FakeChain implements Rpc {
  runId = digest('run1'); chainId = '0x7a69'; code = '0x6000'; fail = false; wrongView = false; duplicateLogs = false;
  nonce = '0x0';
  blocks: any[] = []; logs: any[] = []; worlds: World[] = [];
  readonly target = fixtureTarget();
  constructor() { this.addBlock(); this.addBlock(); }
  addBlock(events: Array<[string, unknown[]]> = [], label = 'canonical') {
    const number = this.blocks.length;
    const hash = digest(`${this.runId}:${label}:${number}`);
    this.blocks.push({ number: tag(BigInt(number)), hash, parentHash: this.blocks.at(-1)?.hash ?? digest('parent'), timestamp: tag(1700000000n + BigInt(number)) });
    const world: World = structuredClone(this.worlds.at(-1) ?? { properties: {}, balance: 0n });
    events.forEach(([name, values], index) => {
      const encoded = abi.encodeEventLog(abi.getEvent(name)!, values);
      this.logs.push({ address: this.target.address, blockNumber: tag(BigInt(number)), blockHash: hash, transactionHash: digest(`${hash}:tx:${index}`), transactionIndex: tag(BigInt(index)), logIndex: tag(BigInt(index)), topics: encoded.topics, data: encoded.data, removed: false });
      const id = String(values[0]);
      if (name === 'PropertyCreated') world.properties[id] = { name: String(values[1]), location: String(values[2]), total: BigInt(String(values[3])), available: BigInt(String(values[3])), price: BigInt(String(values[4])), active: true, holders: {} };
      else if (name === 'TokensPurchased') { const p = world.properties[id]; const who = String(values[1]).toLowerCase(); const n = BigInt(String(values[2])); p.available -= n; p.holders[who] = (p.holders[who] ?? 0n) + n; world.balance += BigInt(String(values[3])); }
      else if (name === 'TokensTransferred') { const p = world.properties[id]; const from = String(values[1]).toLowerCase(); const to = String(values[2]).toLowerCase(); const n = BigInt(String(values[3])); p.holders[from] -= n; p.holders[to] = (p.holders[to] ?? 0n) + n; }
      else if (name === 'PropertyStatusChanged') world.properties[id].active = Boolean(values[1]);
      else if (name === 'FundsWithdrawn') world.balance = 0n;
    });
    this.worlds.push(world);
  }
  fork(ancestor: number) { this.blocks.length = ancestor + 1; this.worlds.length = ancestor + 1; this.logs = this.logs.filter(log => BigInt(log.blockNumber) <= BigInt(ancestor)); }
  async request<T = unknown>(method: string, args: any[]): Promise<T> {
    if (this.fail) throw new Error('rpc-failure-secret');
    let result: any;
    if (method === 'eth_chainId') result = this.chainId;
    else if (method === 'hardhat_metadata') result = { chainId: 31337, instanceId: this.runId };
    else if (method === 'eth_getBlockByNumber') result = this.blocks[args[0] === 'latest' ? this.blocks.length - 1 : Number(BigInt(args[0]))] ?? null;
    else if (method === 'eth_getTransactionReceipt') result = args[0] === this.target.transactionHash ? { transactionHash: this.target.transactionHash, status: '0x1', from: owner, contractAddress: this.target.address, blockNumber: '0x1', blockHash: this.blocks[1]?.hash } : null;
    else if (method === 'eth_getTransactionByHash') result = { hash: this.target.transactionHash, from: owner, to: null, nonce: this.nonce, input: this.target.creationBytecode, blockNumber: '0x1', blockHash: this.blocks[1]?.hash };
    else if (method === 'eth_getCode') result = this.code;
    else if (method === 'eth_getLogs') { result = this.logs.filter(log => BigInt(log.blockNumber) >= BigInt(args[0].fromBlock) && BigInt(log.blockNumber) <= BigInt(args[0].toBlock)); if (this.duplicateLogs) result = [...result, ...result]; }
    else {
      const world = this.worlds[Number(BigInt(args[1]))];
      if (method === 'eth_getBalance') result = tag(world.balance);
      else if (method === 'eth_call') {
        const call = abi.parseTransaction({ data: args[0].data })!;
        let values: unknown[];
        if (call.name === 'owner') values = [owner];
        else if (call.name === 'propertyCount') values = [Object.keys(world.properties).length];
        else {
          const id = call.args[0].toString(); const p = world.properties[id];
          if (call.name === 'getTokenBalance') values = [p.holders[String(call.args[1]).toLowerCase()] ?? 0n];
          else values = [id, p.name, p.location, p.total, this.wrongView ? p.available + 1n : p.available, p.price, p.active];
        }
        result = abi.encodeFunctionResult(call.name, values);
      } else throw new Error('Unsupported test RPC method');
    }
    return result as T;
  }
}
