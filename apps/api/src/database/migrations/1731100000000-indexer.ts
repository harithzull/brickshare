import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class Indexer1731100000000 implements MigrationInterface {
  name = 'Indexer1731100000000';
  async up(runner: QueryRunner) { await runner.query(readFileSync(join(__dirname, 'sql/002-indexer.up.sql'), 'utf8')); }
  async down(runner: QueryRunner) { await runner.query(readFileSync(join(__dirname, 'sql/002-indexer.down.sql'), 'utf8')); }
}
