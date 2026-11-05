export class IndexerError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function ensure(condition: unknown, code = 'deployment_invalid'): asserts condition {
  if (!condition) throw new IndexerError(code);
}
export interface Rpc { request<T = unknown>(method: string, params: unknown[]): Promise<T>; }
const allowed = new Set(['eth_chainId', 'hardhat_metadata', 'eth_getBlockByNumber', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getCode', 'eth_getLogs', 'eth_call', 'eth_getBalance']);
export class LocalRpc implements Rpc {
  private id = 0;
  constructor(private readonly url: string, private readonly timeout: number) {}
  async request<T>(method: string, params: unknown[]): Promise<T> {
    ensure(allowed.has(method), 'rpc_method_forbidden');
    const id = ++this.id;
    try {
      const response = await fetch(this.url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(this.timeout) });
      ensure(response.ok, 'rpc_unavailable');
      const body = await response.json() as { id: number; jsonrpc: string; error?: unknown; result: T };
      ensure(body.id === id && body.jsonrpc === '2.0' && !body.error && 'result' in body, 'rpc_unavailable');
      return body.result;
    } catch { throw new IndexerError('rpc_unavailable'); }
  }
}
export const hash = (value: unknown): string => { ensure(typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)); return value.toLowerCase(); };
export const address = (value: unknown): string => { ensure(typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value)); return value.toLowerCase(); };
export const quantity = (value: unknown): bigint => { ensure(typeof value === 'string' && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)); return BigInt(value); };
export const tag = (number: bigint) => `0x${number.toString(16)}`;
export const bytes = (value: string) => Buffer.from(value.slice(2), 'hex');
export interface Block { number: bigint; hash: string; parentHash: string; timestamp: bigint; }
export async function blockAt(rpc: Rpc, number: bigint | 'latest'): Promise<Block | null> {
  const raw = await rpc.request<{ number: string; hash: string; parentHash: string; timestamp: string } | null>('eth_getBlockByNumber', [number === 'latest' ? number : tag(number), false]);
  if (!raw) return null;
  const block = { number: quantity(raw.number), hash: hash(raw.hash), parentHash: hash(raw.parentHash), timestamp: quantity(raw.timestamp) };
  ensure(block.number <= 9223372036854775807n && block.timestamp <= 8640000000000n && (number === 'latest' || block.number === number));
  return block;
}
export async function instanceId(rpc: Rpc): Promise<string> {
  ensure(quantity(await rpc.request('eth_chainId', [])) === 31337n, 'wrong_chain');
  const metadata = await rpc.request<{ instanceId: string; chainId: number; forkedNetwork?: unknown }>('hardhat_metadata', []);
  ensure(metadata.chainId === 31337 && !metadata.forkedNetwork, 'wrong_chain');
  return hash(metadata.instanceId);
}
