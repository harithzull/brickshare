import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { apiEnvPath, validateEnvironment } from '../config/environment';
import { DatabaseModule, DatabaseService } from '../database/database.module';
import { JsonLogger } from '../common/json-logger';
import { IndexerSettings, indexerSettings } from './config';
import { loadTarget } from './identity';
import { LocalRpc } from './rpc';
import { IndexingWorker } from './worker';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: apiEnvPath, validate: raw => ({ validated: validateEnvironment(raw), indexer: indexerSettings(raw) }) }), DatabaseModule] })
class WorkerModule {}
async function main() {
  const logger = new JsonLogger();
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger, abortOnError: false });
  let stopping = false;
  let wake: (() => void) | undefined;
  const stop = () => { stopping = true; wake?.(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const config = app.get(ConfigService);
    const settings = config.getOrThrow<IndexerSettings>('indexer');
    const target = loadTarget(settings);
    const database = app.get(DatabaseService); await database.requireReady();
    const worker = new IndexingWorker(database.source, new LocalRpc(settings.rpcUrl, settings.timeoutMs), settings, target, logger);
    let failures = 0;
    do {
      let result: string;
      try { result = await worker.tick(); failures = 0; }
      catch { failures++; result = 'error'; if (process.argv.includes('--once')) throw new Error('Worker tick failed'); }
      if (process.argv.includes('--once') && result === 'locked') { logger.event('warn', 'indexer_lock_unavailable'); throw new Error('Another worker owns the chain lock'); }
      if (process.argv.includes('--once') && result !== 'syncing') break;
      if (stopping) break;
      const delay = result === 'syncing' ? 0 : Math.min(30000, settings.pollMs * 2 ** Math.min(failures, 4));
      await new Promise<void>(resolve => { const timer = setTimeout(() => { wake = undefined; resolve(); }, delay); wake = () => { clearTimeout(timer); wake = undefined; resolve(); }; });
    } while (!stopping);
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); await app.close(); }
}
main().catch(() => { new JsonLogger().event('fatal', 'indexer_stopped', { hint: 'Check API DB migrations, local RPC, deployment provenance and INDEXER_* settings. Values redacted.' }); process.exitCode = 1; });
