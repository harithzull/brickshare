import { Interface } from 'ethers';
import { address, ensure, hash, quantity } from './rpc';

export interface Event {
  blockNumber: string; blockHash: string; transactionHash: string; transactionIndex: number; logIndex: number;
  eventName: string; topics: string[]; data: string; payload: Record<string, string | boolean>;
}
export function decodeLogs(abi: Interface, contract: string, logs: any[], maxEvents: number): Event[] {
  ensure(Array.isArray(logs) && logs.length <= maxEvents, 'resource_limit');
  const unique = new Map<string, Event>();
  for (const log of logs) {
    ensure(address(log.address) === contract && !log.removed, 'invalid_event');
    ensure(Array.isArray(log.topics) && log.topics.every((topic: unknown) => /^0x[0-9a-fA-F]{64}$/.test(String(topic))) && /^0x([a-fA-F0-9]{2})*$/.test(log.data), 'invalid_event');
    const decoded = abi.parseLog(log);
    ensure(decoded && ['PropertyCreated', 'TokensPurchased', 'TokensTransferred', 'PropertyStatusChanged', 'FundsWithdrawn'].includes(decoded.name), 'invalid_event');
    const payload: Event['payload'] = {};
    decoded.fragment.inputs.forEach((input, index) => { payload[input.name] = typeof decoded.args[index] === 'boolean' ? decoded.args[index] : String(decoded.args[index]); });
    const transactionIndex = Number(quantity(log.transactionIndex));
    const logIndex = Number(quantity(log.logIndex));
    ensure(Number.isSafeInteger(transactionIndex) && transactionIndex <= 2147483647 && Number.isSafeInteger(logIndex) && logIndex <= 2147483647, 'invalid_event');
    const event: Event = { blockNumber: quantity(log.blockNumber).toString(), blockHash: hash(log.blockHash), transactionHash: hash(log.transactionHash), transactionIndex, logIndex, eventName: decoded.name, topics: log.topics.map(hash), data: log.data.toLowerCase(), payload };
    const key = `${event.blockHash}:${event.logIndex}`;
    if (unique.has(key)) ensure(JSON.stringify(unique.get(key)) === JSON.stringify(event), 'conflicting_event');
    unique.set(key, event);
  }
  return [...unique.values()].sort((a, b) => BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? 1 : a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex);
}
export interface ProjectedProperty {
  id: string; name: string; location: string; total: bigint; available: bigint; price: bigint; active: boolean;
  creationBlockHash: string; holders: Map<string, bigint>;
}
const uintMax = (1n << 256n) - 1n;
export function project(events: Event[], owner: string, maxProperties: number) {
  const properties = new Map<string, ProjectedProperty>();
  let treasury = 0n;
  for (const event of events) {
    const p = event.payload;
    const uint = (key: string, positive = false) => { ensure(typeof p[key] === 'string' && /^(0|[1-9]\d*)$/.test(p[key] as string), 'invalid_event'); const n = BigInt(p[key]); ensure(n >= (positive ? 1n : 0n) && n <= uintMax, 'invalid_event'); return n; };
    if (event.eventName === 'FundsWithdrawn') {
      const amount = uint('amount', true);
      ensure(address(p.owner) === owner && treasury === amount, 'reconciliation_failed');
      treasury = 0n; continue;
    }
    const id = uint('propertyId', true).toString();
    if (event.eventName === 'PropertyCreated') {
      ensure(properties.size < maxProperties, 'resource_limit');
      ensure(!properties.has(id) && BigInt(id) === BigInt(properties.size) + 1n && typeof p.name === 'string' && typeof p.location === 'string', 'invalid_event');
      properties.set(id, { id, name: p.name, location: p.location, total: uint('totalTokens', true), available: uint('totalTokens', true), price: uint('tokenPrice', true), active: true, creationBlockHash: event.blockHash, holders: new Map() });
      continue;
    }
    const property = properties.get(id);
    ensure(property, 'invalid_event');
    if (event.eventName === 'TokensPurchased') {
      const amount = uint('amount', true); const totalCost = uint('totalCost', true); const buyer = address(p.buyer);
      ensure(property.active && property.available >= amount && property.price * amount === totalCost, 'reconciliation_failed');
      property.available -= amount; property.holders.set(buyer, (property.holders.get(buyer) ?? 0n) + amount); treasury += totalCost;
    } else if (event.eventName === 'TokensTransferred') {
      const from = address(p.from); const to = address(p.to); const amount = uint('amount', true);
      ensure((property.holders.get(from) ?? 0n) >= amount, 'reconciliation_failed');
      property.holders.set(from, property.holders.get(from)! - amount);
      property.holders.set(to, (property.holders.get(to) ?? 0n) + amount);
    } else {
      ensure(event.eventName === 'PropertyStatusChanged' && typeof p.active === 'boolean', 'invalid_event'); property.active = p.active;
    }
  }
  let participants = 0;
  for (const property of properties.values()) {
    ensure(property.available + [...property.holders.values()].reduce((sum, balance) => sum + balance, 0n) === property.total, 'reconciliation_failed');
    participants += property.holders.size;
  }
  ensure(participants <= 10000, 'resource_limit');
  return { properties, treasury };
}
