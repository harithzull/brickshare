import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { apiEnvPath, validateEnvironment } from '../config/environment';
import { createDataSource } from '../database/data-source';
import { addressBytes, audit } from './security';

async function main() {
  if (existsSync(apiEnvPath)) process.loadEnvFile(apiEnvPath);
  const env = validateEnvironment(process.env);
  if (env.NODE_ENV === 'production' || !env.ALLOW_LOCAL_ADMIN_BOOTSTRAP) throw new Error('Local admin bootstrap is not enabled');
  const [walletAddress, mode = 'grant'] = process.argv.slice(2);
  if (!walletAddress || !['grant', 'revoke'].includes(mode)) throw new Error('Use a verified wallet address and grant/revoke');
  const source = createDataSource(env);
  try {
    await source.initialize(); if (await source.showMigrations()) throw new Error('Apply migrations first');
    await source.transaction(async manager => {
      const [wallet] = await manager.query('SELECT user_id FROM wallet_identities WHERE address=$1', [addressBytes(walletAddress)]);
      if (!wallet) throw new Error('Wallet must sign in successfully before bootstrap');
      await manager.query('UPDATE users SET platform_role=$2 WHERE id=$1', [wallet.user_id, mode === 'grant' ? 'platform_admin' : 'investor']);
      await audit(manager, mode === 'grant' ? 'auth.platform_admin_granted' : 'auth.platform_admin_revoked', null, null, undefined, { source: 'local_operator_cli' }, wallet.user_id);
    });
    process.stdout.write('Local platform role updated and audited. Disable ALLOW_LOCAL_ADMIN_BOOTSTRAP after use.\n');
  } finally { if (source.isInitialized) await source.destroy(); }
}
main().catch(() => { process.stderr.write('Admin bootstrap failed. Check the explicit local flag, verified wallet, migrations and arguments. Values redacted.\n'); process.exitCode = 1; });
