import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureHttp } from './common/http';
import { JsonLogger } from './common/json-logger';
import { Environment } from './config/environment';

async function main() {
  const logger = new JsonLogger();
  const app = await NestFactory.create(AppModule.register(), { logger, abortOnError: false, bodyParser: false });
  const env = app.get(ConfigService).getOrThrow<Environment>('validated');
  configureHttp(app, env, logger);
  await app.listen(env.API_PORT, env.API_HOST);
  logger.event('info', 'api_listening', { port: env.API_PORT, synchronization: 'not_implemented' });
}
main().catch(() => { new JsonLogger().event('fatal', 'api_startup_failed', { hint: 'Check API environment and database configuration; values are redacted.' }); process.exitCode = 1; });
