import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { apiEnvPath, validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { NetworksModule } from './networks/networks.module';
import { PropertiesModule } from './properties/properties.module';
import { SynchronizationModule } from './indexer/synchronization.module';

@Module({})
export class AppModule {
  static register(input?: Record<string, unknown>): DynamicModule {
    return { module: AppModule, imports: [
      ConfigModule.forRoot({ isGlobal: true, cache: true, envFilePath: apiEnvPath, ignoreEnvFile: !!input, validate: raw => ({ validated: validateEnvironment(input ?? raw) }) }),
      DatabaseModule, SynchronizationModule, HealthModule, NetworksModule, PropertiesModule,
    ] };
  }
}
