import { DataSource, QueryRunner } from 'typeorm';
import { JsonLogger } from '../common/json-logger';
import { IndexerSettings } from './config';
import { Target, verifyTarget } from './identity';
import { Block, Rpc, IndexerError, ensure, address, blockAt, bytes, instanceId, tag } from './rpc';
import { decodeLogs, Event, project } from './projection';

const hex = (value: Buffer) => `0x${value.toString('hex')}`;
export class IndexingWorker {
  constructor(private readonly source: DataSource, private readonly rpc: Rpc, private readonly settings: IndexerSettings, private readonly target: Target, private readonly logger: JsonLogger) {}

  async tick(): Promise<'synced' | 'syncing' | 'locked'> {
    const runner = this.source.createQueryRunner();
    // One Hardhat chain namespace per database. Serialize reset handling across
    // addresses as well: a redeploy after reset may use a different address.
    const lock = 'brickshare-indexer:31337';
    let locked = false; let activeId: string | undefined; let reorgDetected = false;
    await runner.connect();
    try {
      locked = (await runner.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [lock]))[0].locked;
      if (!locked) return 'locked';
      const current = (await runner.query(`SELECT i.* FROM deployment_instances i JOIN contract_deployments d ON d.id=i.deployment_id JOIN chains c ON c.id=d.chain_id WHERE c.chain_id=31337 AND d.address=$1 AND i.active`, [bytes(this.target.address)]))[0];
      activeId = current?.id;
      if (activeId) await runner.query('UPDATE indexer_cursors SET last_attempt_at=now() WHERE instance_id=$1', [activeId]);
      // Compare the Hardhat run identity before receipt checks: stale manifests after
      // hardhat_reset must invalidate previous snapshots even when the receipt vanished.
      const runId = await instanceId(this.rpc);
      const localHistory = await runner.query(`SELECT i.id,i.hardhat_instance_id,i.active FROM deployment_instances i JOIN contract_deployments d ON d.id=i.deployment_id JOIN chains c ON c.id=d.chain_id WHERE c.chain_id=31337`);
      for (const old of localHistory.filter((row: any) => row.active && hex(row.hardhat_instance_id) !== runId)) {
        await this.invalidate(runner, old.id, 'reset_requires_rebind');
        if (activeId === old.id) activeId = undefined;
      }
      if (localHistory.length && !localHistory.some((row: any) => row.active && hex(row.hardhat_instance_id) === runId)) ensure(this.settings.allowRebind, 'reset_requires_rebind');
      const verified = await verifyTarget(this.rpc, this.target);
      ensure(verified.runId === runId, 'batch_changed');
      if (current && hex(current.fingerprint) !== verified.fingerprint && hex(current.hardhat_instance_id) === runId) {
        await this.invalidate(runner, current.id, 'deployment_changed'); activeId = undefined;
        ensure(this.settings.allowRebind, 'reset_requires_rebind');
      }
      // A previous failed/reset run may already have invalidated the active instance.
      const history = await runner.query(`SELECT i.id,i.fingerprint,i.active FROM deployment_instances i JOIN contract_deployments d ON d.id=i.deployment_id JOIN chains c ON c.id=d.chain_id WHERE c.chain_id=31337 AND d.address=$1`, [bytes(this.target.address)]);
      if (history.length && !history.some((row: any) => row.active && hex(row.fingerprint) === verified.fingerprint)) ensure(this.settings.allowRebind, 'reset_requires_rebind');
      await runner.startTransaction();
      try {
        const chain = (await runner.query(`INSERT INTO chains(chain_id,name) VALUES(31337,'Hardhat Local') ON CONFLICT(chain_id) DO UPDATE SET chain_id=EXCLUDED.chain_id RETURNING id`))[0];
        const deployment = (await runner.query(`INSERT INTO contract_deployments(chain_id,address,deployment_block,deployment_block_hash,transaction_hash,owner_address,artifact_hash,abi_version,release_reference)
          VALUES($1,$2,$3,$4,$5,$6,$7,'RealEstateTokenization-0.8.19',$8)
          ON CONFLICT(chain_id,address) DO UPDATE SET deployment_block=EXCLUDED.deployment_block,deployment_block_hash=EXCLUDED.deployment_block_hash,transaction_hash=EXCLUDED.transaction_hash,owner_address=EXCLUDED.owner_address,artifact_hash=EXCLUDED.artifact_hash,abi_version=EXCLUDED.abi_version,release_reference=EXCLUDED.release_reference RETURNING id`,
        [chain.id, bytes(this.target.address), this.target.deploymentBlock.toString(), bytes(verified.deployment.hash), bytes(this.target.transactionHash), bytes(this.target.deployer), bytes(this.target.runtimeHash), this.settings.releaseReference]))[0];
        const instance = (await runner.query(`INSERT INTO deployment_instances(deployment_id,fingerprint,hardhat_instance_id,genesis_hash,deployment_block,deployment_block_hash,transaction_hash,runtime_hash,abi_hash,owner_address,release_reference)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(deployment_id,fingerprint) DO UPDATE SET active=true RETURNING id`,
        [deployment.id, bytes(verified.fingerprint), bytes(runId), bytes(verified.genesis.hash), this.target.deploymentBlock.toString(), bytes(verified.deployment.hash), bytes(this.target.transactionHash), bytes(this.target.runtimeHash), bytes(this.target.abiHash), bytes(this.target.deployer), this.settings.releaseReference]))[0];
        activeId = instance.id;
        await runner.query('INSERT INTO indexer_cursors(instance_id,last_attempt_at) VALUES($1,now()) ON CONFLICT DO NOTHING', [activeId]);
        if (this.settings.allowRebind) await runner.query(`UPDATE indexer_cursors SET last_scanned_block=NULL,last_scanned_hash=NULL,observed_head=NULL,status='initializing',error_code=NULL WHERE instance_id=$1 AND status='invalidated'`, [activeId]);
        await runner.commitTransaction();
      } catch (error) { await runner.rollbackTransaction(); throw error; }

      const cursor = (await runner.query('SELECT * FROM indexer_cursors WHERE instance_id=$1', [activeId]))[0];
      ensure(cursor.status !== 'invalidated', 'reset_requires_rebind');
      const head = await blockAt(this.rpc, 'latest'); ensure(head && head.number >= this.target.deploymentBlock, 'deployment_invalid');
      let ancestor = cursor.last_scanned_block === null ? this.target.deploymentBlock - 1n : BigInt(cursor.last_scanned_block);
      let reorg = false;
      if (cursor.last_scanned_block !== null) {
        const scanned = await blockAt(this.rpc, ancestor);
        if (!scanned || scanned.hash !== hex(cursor.last_scanned_hash)) {
          reorg = true; reorgDetected = true;
          const candidates = await runner.query('SELECT block_number,block_hash FROM chain_blocks WHERE instance_id=$1 AND canonical AND block_number <= $2 ORDER BY block_number DESC LIMIT $3', [activeId, head.number.toString(), this.settings.reorgDepth + 1]);
          let found = false;
          for (const candidate of candidates) {
            if (BigInt(cursor.last_scanned_block) - BigInt(candidate.block_number) > BigInt(this.settings.reorgDepth)) break;
            const block = await blockAt(this.rpc, BigInt(candidate.block_number));
            if (block?.hash === hex(candidate.block_hash)) { ancestor = block.number; found = true; break; }
          }
          ensure(found, 'reorg_too_deep');
        }
      }
      const end = head.number < ancestor + BigInt(this.settings.batchSize) ? head.number : ancestor + BigInt(this.settings.batchSize);
      const anchor = await blockAt(this.rpc, end); ensure(anchor, 'batch_changed');
      if (cursor.last_scanned_block !== null) {
        const storedAncestor = (await runner.query('SELECT block_hash FROM chain_blocks WHERE instance_id=$1 AND canonical AND block_number=$2', [activeId, ancestor.toString()]))[0];
        ensure(storedAncestor && (await blockAt(this.rpc, ancestor))?.hash === hex(storedAncestor.block_hash), 'batch_changed');
      }
      const blocks: Block[] = [];
      // Keep the pre-deployment block as a rollback anchor for a first-property reorg.
      if (cursor.last_scanned_block === null) { const before = await blockAt(this.rpc, ancestor); ensure(before, 'batch_changed'); blocks.push(before); }
      for (let n = ancestor + 1n; n <= end; n++) { const block = await blockAt(this.rpc, n); ensure(block, 'batch_changed'); blocks.push(block); }
      let parentHash = (await blockAt(this.rpc, ancestor))?.hash;
      for (const block of blocks.filter(block => block.number > ancestor)) { ensure(block.parentHash === parentHash, 'batch_changed'); parentHash = block.hash; }
      const rawLogs = end > ancestor ? await this.rpc.request<any[]>('eth_getLogs', [{ address: this.target.address, fromBlock: tag(ancestor + 1n), toBlock: tag(end) }]) : [];
      const incoming = decodeLogs(this.target.abi, this.target.address, rawLogs, this.settings.maxEvents);
      const blockHashes = new Map(blocks.map(block => [block.number.toString(), block.hash]));
      for (const event of incoming) ensure(BigInt(event.blockNumber) > ancestor && BigInt(event.blockNumber) <= end && blockHashes.get(event.blockNumber) === event.blockHash, 'batch_changed');
      const pastRows = await runner.query('SELECT * FROM chain_events WHERE instance_id=$1 AND canonical AND block_number<=$2 ORDER BY block_number,transaction_index,log_index LIMIT $3', [activeId, ancestor.toString(), this.settings.maxEvents + 1]);
      const past: Event[] = pastRows.map((row: any) => ({ blockNumber: row.block_number, blockHash: hex(row.block_hash), transactionHash: hex(row.transaction_hash), transactionIndex: row.transaction_index, logIndex: row.log_index, eventName: row.event_name, topics: row.topics, data: row.data, payload: row.payload }));
      ensure(past.length + incoming.length <= this.settings.maxEvents, 'resource_limit');
      const projection = project([...past, ...incoming], this.target.deployer, this.settings.maxProperties);
      const call = async (method: string, args: unknown[] = []) => this.target.abi.decodeFunctionResult(method, await this.rpc.request<string>('eth_call', [{ to: this.target.address, data: this.target.abi.encodeFunctionData(method, args) }, tag(end)]));
      ensure((await call('propertyCount'))[0] === BigInt(projection.properties.size), 'reconciliation_failed');
      ensure(address((await call('owner'))[0]) === this.target.deployer, 'reconciliation_failed');
      for (const property of projection.properties.values()) {
        const view = await call('getProperty', [property.id]);
        ensure(view[0].toString() === property.id && view[1] === property.name && view[2] === property.location && view[3] === property.total && view[4] === property.available && view[5] === property.price && view[6] === property.active, 'reconciliation_failed');
        for (const [holder, balance] of property.holders) ensure((await call('getTokenBalance', [property.id, holder]))[0] === balance, 'reconciliation_failed');
      }
      // No signer or owner impersonation: native balance is a public RPC read.
      const nativeBalance = await this.rpc.request<string>('eth_getBalance', [this.target.address, tag(end)]);
      ensure(BigInt(nativeBalance) === projection.treasury, 'reconciliation_failed');
      ensure((await blockAt(this.rpc, end))?.hash === anchor.hash && await instanceId(this.rpc) === runId, 'batch_changed');
      await runner.startTransaction();
      try {
        if (reorg) {
          await runner.query('UPDATE chain_events SET canonical=false WHERE instance_id=$1 AND block_number>$2 AND canonical', [activeId, ancestor.toString()]);
          await runner.query('UPDATE chain_blocks SET canonical=false WHERE instance_id=$1 AND block_number>$2 AND canonical', [activeId, ancestor.toString()]);
        }
        for (const block of blocks) await runner.query(`INSERT INTO chain_blocks(instance_id,block_number,block_hash,parent_hash,block_timestamp) VALUES($1,$2,$3,$4,$5) ON CONFLICT(instance_id,block_hash) DO UPDATE SET canonical=true`, [activeId, block.number.toString(), bytes(block.hash), bytes(block.parentHash), new Date(Number(block.timestamp) * 1000)]);
        for (const event of incoming) await runner.query(`INSERT INTO chain_events(instance_id,block_number,block_hash,transaction_hash,transaction_index,log_index,event_name,topics,data,payload)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(instance_id,block_hash,transaction_hash,log_index) DO UPDATE SET canonical=true`, [activeId, event.blockNumber, bytes(event.blockHash), bytes(event.transactionHash), event.transactionIndex, event.logIndex, event.eventName, JSON.stringify(event.topics), event.data, JSON.stringify(event.payload)]);
        await runner.query('UPDATE properties SET canonical_snapshot=false WHERE deployment_instance_id=$1 AND canonical_snapshot', [activeId]);
        const instance = (await runner.query('SELECT deployment_id FROM deployment_instances WHERE id=$1', [activeId]))[0];
        for (const property of projection.properties.values()) await runner.query(`INSERT INTO properties(source,deployment_id,deployment_instance_id,creation_block_hash,canonical_snapshot,on_chain_id,chain_name,chain_location,total_tokens,available_tokens,token_price_wei,active,observed_block,observed_block_hash)
          VALUES('blockchain',$1,$2,$3,true,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT(deployment_instance_id,on_chain_id,creation_block_hash) DO UPDATE SET canonical_snapshot=true,chain_name=EXCLUDED.chain_name,chain_location=EXCLUDED.chain_location,total_tokens=EXCLUDED.total_tokens,available_tokens=EXCLUDED.available_tokens,token_price_wei=EXCLUDED.token_price_wei,active=EXCLUDED.active,observed_block=EXCLUDED.observed_block,observed_block_hash=EXCLUDED.observed_block_hash`, [instance.deployment_id, activeId, bytes(property.creationBlockHash), property.id, property.name, property.location, property.total.toString(), property.available.toString(), property.price.toString(), property.active, end.toString(), bytes(anchor.hash)]);
        const status = end === head.number ? 'synced' : 'syncing';
        await runner.query(`UPDATE indexer_cursors SET last_scanned_block=$2,last_scanned_hash=$3,observed_head=$4,status=$5,error_code=NULL,reorg_count=reorg_count+$6,revision=revision+1,last_attempt_at=now(),last_success_at=now() WHERE instance_id=$1`, [activeId, end.toString(), bytes(anchor.hash), head.number.toString(), status, reorg ? 1 : 0]);
        // Recheck immediately before commit; RPC/DB cannot form a distributed atomic
        // snapshot, so the next poll also checks this watermark's canonical hash.
        ensure((await blockAt(this.rpc, end))?.hash === anchor.hash && (await blockAt(this.rpc, this.target.deploymentBlock))?.hash === verified.deployment.hash && await instanceId(this.rpc) === runId, 'batch_changed');
        await runner.commitTransaction();
        this.logger.event('info', 'indexer_batch_committed', { instanceId: activeId, indexedBlock: end.toString(), events: incoming.length, properties: projection.properties.size, reorg });
        return status;
      } catch (error) { await runner.rollbackTransaction(); throw error; }
    } catch (error) {
      const code = error instanceof IndexerError ? error.code : 'processing_failed';
      if (activeId) {
        if (['deployment_invalid', 'wrong_chain', 'reorg_too_deep'].includes(code)) await this.invalidate(runner, activeId, code);
        else {
          await runner.startTransaction();
          try {
            // A failed repair must not leave a known-orphaned snapshot visible.
            // Keep raw history/cursor for a retry from the same common ancestor.
            if (reorgDetected || code === 'batch_changed') await runner.query('UPDATE properties SET canonical_snapshot=false WHERE deployment_instance_id=$1', [activeId]);
            await runner.query(`UPDATE indexer_cursors SET status='error',error_code=$2,last_attempt_at=now() WHERE instance_id=$1 AND status<>'invalidated'`, [activeId, code]);
            await runner.commitTransaction();
          } catch (stateError) { await runner.rollbackTransaction(); throw stateError; }
        }
      }
      this.logger.event('warn', 'indexer_tick_failed', { code });
      throw new IndexerError(code);
    } finally {
      try { if (locked) await runner.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lock]); }
      finally { await runner.release(); }
    }
  }
  private async invalidate(runner: QueryRunner, id: string, code: string) {
    await runner.startTransaction();
    try {
      await runner.query('UPDATE properties SET canonical_snapshot=false WHERE deployment_instance_id=$1', [id]);
      await runner.query('UPDATE chain_events SET canonical=false WHERE instance_id=$1', [id]);
      await runner.query('UPDATE chain_blocks SET canonical=false WHERE instance_id=$1', [id]);
      await runner.query('UPDATE deployment_instances SET active=false WHERE id=$1', [id]);
      await runner.query(`UPDATE indexer_cursors SET status='invalidated',error_code=$2,last_attempt_at=now() WHERE instance_id=$1`, [id, code]);
      await runner.commitTransaction();
    } catch (error) { await runner.rollbackTransaction(); throw error; }
  }
}
