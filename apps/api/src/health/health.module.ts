import { Controller, Get, Module, Res } from '@nestjs/common';
import { Response } from 'express';
import { DatabaseService } from '../database/database.module';
import { SynchronizationService } from '../indexer/synchronization.module';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService, private readonly synchronization: SynchronizationService) {}
  @Get('live') live() { return { status: 'alive' }; }
  @Get('ready') async ready(@Res({ passthrough: true }) response: Response) {
    const state = await this.database.ready();
    response.status(state === 'ready' ? 200 : 503);
    return { status: state === 'ready' ? 'ready' : 'not_ready', checks: { database: state }, synchronization: state === 'ready' ? await this.synchronization.status() : { mode: 'local_read_only', status: 'database_unavailable' } };
  }
}
@Module({ controllers: [HealthController] })
export class HealthModule {}
