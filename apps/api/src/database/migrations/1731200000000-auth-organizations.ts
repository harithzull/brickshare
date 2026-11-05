import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export class AuthOrganizations1731200000000 implements MigrationInterface {
  name = 'AuthOrganizations1731200000000';
  async up(runner: QueryRunner) { await runner.query(readFileSync(join(__dirname, 'sql/003-auth-organizations.up.sql'), 'utf8')); }
  async down(runner: QueryRunner) { await runner.query(readFileSync(join(__dirname, 'sql/003-auth-organizations.down.sql'), 'utf8')); }
}
