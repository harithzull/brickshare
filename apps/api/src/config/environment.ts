import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, validateSync } from 'class-validator';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const integer = ({ value }: { value: unknown }) => typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
const boolean = ({ value }: { value: unknown }) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : value;

export class Environment {
  @IsIn(['development', 'test', 'production']) NODE_ENV = 'development';
  @IsString() @Matches(/^(127\.0\.0\.1|0\.0\.0\.0|localhost)$/) API_HOST = '127.0.0.1';
  @Transform(integer) @IsInt() @Min(1) @Max(65535) API_PORT = 3001;
  @IsString() DATABASE_URL!: string;
  @Matches(/^[a-z_][a-z0-9_]{0,62}$/) DATABASE_SCHEMA = 'public';
  @Transform(boolean) @IsBoolean() DATABASE_SSL = false;
  @Transform(integer) @IsInt() @Min(100) @Max(10000) DATABASE_CONNECT_TIMEOUT_MS = 2000;
  @IsString() CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173';
  @IsOptional() @IsString() ASSET_PUBLIC_BASE_URL?: string;
  @Transform(boolean) @IsBoolean() ALLOW_FICTIONAL_SEED = false;
  @Transform(integer) @IsInt() @Min(1000) @Max(3600000) INDEXER_STALE_AFTER_MS = 30000;
}

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const fields = Object.keys(new Environment());
  const selected: Record<string, unknown> = {};
  for (const key of [...fields, 'DATABASE_URL', 'ASSET_PUBLIC_BASE_URL']) if (input[key] !== undefined) selected[key] = input[key];
  const env = plainToInstance(Environment, selected, { enableImplicitConversion: false });
  const errors = validateSync(env, { validationError: { target: false, value: false } });
  if (errors.length) throw new Error(`Invalid API configuration: ${errors.map(error => error.property).join(', ')}. Check apps/api/.env; values are redacted.`);
  try {
    const url = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1) || !url.username || !url.password || url.password === 'CHANGE_ME' || url.search) throw new Error();
    const origins = env.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
    for (const origin of origins) { const parsed = new URL(origin); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) throw new Error(); }
    if (env.ASSET_PUBLIC_BASE_URL) { const asset = new URL(env.ASSET_PUBLIC_BASE_URL); if (asset.protocol !== 'https:' || asset.username || asset.password || asset.search || asset.hash) throw new Error(); }
    if (env.NODE_ENV === 'production' && (!env.DATABASE_SSL || origins.some(origin => !origin.startsWith('https://')))) throw new Error();
  } catch { throw new Error('Invalid API database URL, TLS, CORS or public asset configuration. Values are redacted.'); }
  return env;
}

// CLI and Nest resolve only this API env file, never the deployment-key .env.
function findApiRoot(): string {
  let directory = __dirname;
  while (true) {
    const candidate = join(directory, 'package.json');
    if (existsSync(candidate) && JSON.parse(readFileSync(candidate, 'utf8')).name === '@brickshare/api') return directory;
    const parent = dirname(directory);
    if (parent === directory) throw new Error('API package root could not be resolved.');
    directory = parent;
  }
}
export const apiRoot = findApiRoot();
export const apiEnvPath = join(apiRoot, '.env');
