import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, validateSync } from 'class-validator';
import { dirname, join, resolve, sep, parse } from 'node:path';
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
  @IsString() AUTH_ORIGIN = 'http://127.0.0.1:5173';
  @IsString() AUTH_CHAIN_IDS = '31337';
  @Transform(integer) @IsInt() @Min(60) @Max(600) AUTH_CHALLENGE_TTL_SECONDS = 300;
  @Transform(integer) @IsInt() @Min(60) @Max(86400) AUTH_SESSION_TTL_SECONDS = 3600;
  @Transform(boolean) @IsBoolean() AUTH_COOKIE_SECURE = false;
  @Transform(boolean) @IsBoolean() ALLOW_LOCAL_ADMIN_BOOTSTRAP = false;
  @IsString() STUDIO_STORAGE_DIR = '.brickshare-storage';
  @IsString() STUDIO_RPC_URL = 'http://127.0.0.1:8545';
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
    const auth = new URL(env.AUTH_ORIGIN);
    const studioRpc = new URL(env.STUDIO_RPC_URL);
    if (studioRpc.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(studioRpc.hostname) || studioRpc.username || studioRpc.password || studioRpc.search || studioRpc.hash || studioRpc.pathname !== '/') throw new Error();
    // Storage is never served statically; restrict configuration to a private root.
    if (!env.STUDIO_STORAGE_DIR.trim() || /[\x00-\x1f]/.test(env.STUDIO_STORAGE_DIR)) throw new Error();
    const normalizePath = (value:string) => process.platform === 'win32' ? value.toLowerCase() : value;
    const workspace = normalizePath(resolve(apiRoot,'../..')); const storage = normalizePath(resolve(workspace,env.STUDIO_STORAGE_DIR)); const privateRoot = join(workspace,'.brickshare-storage');
    if (storage === parse(storage).root || workspace === storage || workspace.startsWith(storage+sep) || (storage.startsWith(workspace+sep) && storage !== privateRoot && !storage.startsWith(privateRoot+sep))) throw new Error();
    if (auth.origin !== env.AUTH_ORIGIN || auth.username || auth.password || !origins.includes(env.AUTH_ORIGIN)) throw new Error();
    if (auth.protocol !== 'https:' && !(auth.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(auth.hostname) && env.NODE_ENV !== 'production')) throw new Error();
    if (!['localhost', '127.0.0.1', '[::1]'].includes(auth.hostname) && !env.AUTH_COOKIE_SECURE) throw new Error();
    if (!env.AUTH_CHAIN_IDS.split(',').every(id => ['31337', '84532'].includes(id.trim()))) throw new Error();
    if (env.NODE_ENV === 'production' && (!env.AUTH_COOKIE_SECURE || env.ALLOW_LOCAL_ADMIN_BOOTSTRAP)) throw new Error();
  } catch { throw new Error('Invalid API database URL, TLS, CORS, authentication or public asset configuration. Values are redacted.'); }
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
