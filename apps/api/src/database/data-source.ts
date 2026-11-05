import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Environment } from '../config/environment';
import { entities } from './entities';
import { Foundation1731000000000 } from './migrations/1731000000000-foundation';
import { Indexer1731100000000 } from './migrations/1731100000000-indexer';
import { indexerEntities } from './indexer.entities';
import { authEntities } from './auth.entities';
import { AuthOrganizations1731200000000 } from './migrations/1731200000000-auth-organizations';
import { Studio1731300000000 } from './migrations/1731300000000-studio';
import { studioEntities } from './studio.entities';

export function createDataSource(env: Environment): DataSource {
  return new DataSource({
    type: 'postgres', url: env.DATABASE_URL, schema: env.DATABASE_SCHEMA,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    entities: [...entities, ...indexerEntities, ...authEntities, ...studioEntities], migrations: [Foundation1731000000000, Indexer1731100000000, AuthOrganizations1731200000000, Studio1731300000000], migrationsTableName: 'api_migrations',
    synchronize: false, migrationsRun: false, dropSchema: false, logging: false,
    // UUID defaults come from reviewed SQL using PostgreSQL's built-in function.
    // Even read-only startup must never attempt CREATE EXTENSION.
    installExtensions: false,
    connectTimeoutMS: env.DATABASE_CONNECT_TIMEOUT_MS,
    extra: { connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS, statement_timeout: 5000, options: `-c search_path=${env.DATABASE_SCHEMA}`, max: 10 },
  });
}
