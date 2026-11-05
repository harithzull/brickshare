import { Controller, Get, Module, Res } from '@nestjs/common';
import { Response } from 'express';
import { DatabaseService } from '../database/database.module';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}
  @Get('live') live() { return { status: 'alive' }; }
  @Get('ready') async ready(@Res({ passthrough: true }) response: Response) {
    const state = await this.database.ready();
    response.status(state === 'ready' ? 200 : 503);
    return { status: state === 'ready' ? 'ready' : 'not_ready', checks: { database: state }, synchronization: 'not_implemented' };
  }
}
@Module({ controllers: [HealthController] })
export class HealthModule {}
