import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { Environment } from '../config/environment';
import { JsonLogger } from '../common/json-logger';
import { createDataSource } from './data-source';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private connecting?: Promise<void>;
  constructor(readonly source: DataSource, private readonly logger: JsonLogger) {}
  async onModuleInit() { try { await this.connect(); } catch { this.logger.event('warn', 'database_unavailable_at_startup'); } }
  async connect(): Promise<void> {
    if (this.source.isInitialized) return;
    if (!this.connecting) this.connecting = this.source.initialize().then(() => undefined).finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  async ready(): Promise<'ready' | 'database_unavailable' | 'schema_pending'> {
    try { await this.connect(); await this.source.query('SELECT 1'); } catch { return 'database_unavailable'; }
    try {
      const schema = (this.source.options as PostgresConnectionOptions).schema;
      const rows = await this.source.query(`SELECT name FROM "${schema}".api_migrations`);
      const executed = new Set(rows.map((row: { name: string }) => row.name));
      if (!this.source.migrations.every(migration => executed.has(migration.name))) return 'schema_pending';
      return 'ready';
    } catch { return 'schema_pending'; }
  }
  async requireReady() { if (await this.ready() !== 'ready') throw new ServiceUnavailableException('Database or schema unavailable'); }
  async onModuleDestroy() { if (this.source.isInitialized) await this.source.destroy(); }
}

@Global()
@Module({
  providers: [JsonLogger, { provide: DataSource, inject: [ConfigService], useFactory: (config: ConfigService) => createDataSource(config.getOrThrow<Environment>('validated')) }, DatabaseService],
  exports: [DatabaseService, DataSource, JsonLogger],
})
export class DatabaseModule {}
