import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class Foundation1731000000000 implements MigrationInterface {
  name = 'Foundation1731000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(readFileSync(join(__dirname, 'sql/001-foundation.up.sql'), 'utf8'));
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(readFileSync(join(__dirname, 'sql/001-foundation.down.sql'), 'utf8'));
  }
}
