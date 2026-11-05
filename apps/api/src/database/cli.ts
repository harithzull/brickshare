import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { apiEnvPath, validateEnvironment } from '../config/environment';
import { createDataSource } from './data-source';
import { seedFictional, seedNetworks } from './seeds';

async function run() {
  if (existsSync(apiEnvPath)) process.loadEnvFile(apiEnvPath);
  const env = validateEnvironment(process.env);
  const action = process.argv[2];
  if (!['migrate', 'revert', 'networks', 'fictional'].includes(action)) throw new Error('Unknown database command');
  const source = createDataSource(env);
  try {
    await source.initialize();
    if (action === 'migrate') await source.runMigrations({ transaction: 'all' });
    else if (action === 'revert') await source.undoLastMigration({ transaction: 'all' });
    else {
      if (await source.showMigrations()) throw new Error('Apply database migrations before seeding.');
      if (action === 'networks') await seedNetworks(source);
      else await seedFictional(source, env);
    }
    process.stdout.write(JSON.stringify({ level: 'info', event: 'database_command_completed', action }) + '\n');
  } finally { if (source.isInitialized) await source.destroy(); }
}
run().catch(() => { process.stderr.write('Database command failed. Check API configuration, database availability, migrations and seed guards. Details redacted.\n'); process.exitCode = 1; });
