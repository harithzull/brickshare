import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export class Studio1731300000000 implements MigrationInterface {
  name = 'Studio1731300000000';
  async up(runner: QueryRunner) { await runner.query(readFileSync(join(__dirname, 'sql/004-studio.up.sql'), 'utf8')); }
  async down(runner: QueryRunner) { await runner.query(readFileSync(join(__dirname, 'sql/004-studio.down.sql'), 'utf8')); }
}
