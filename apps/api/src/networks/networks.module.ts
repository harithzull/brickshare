import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Chain } from '../database/entities';

@Injectable()
export class NetworksService {
  constructor(private readonly database: DatabaseService) {}
  async list() {
    await this.database.requireReady();
    const rows = await this.database.source.getRepository(Chain).find({ where: { enabled: true }, order: { chainId: 'ASC' } });
    return { data: rows.map(chain => ({ id: chain.id, chainId: chain.chainId, name: chain.name, explorerUrl: chain.explorerUrl })), meta: { source: 'database_configuration', synchronization: 'not_implemented' } };
  }
}
@Controller('api/v1/networks')
export class NetworksController {
  constructor(private readonly networks: NetworksService) {}
  @Get() list() { return this.networks.list(); }
}
@Module({ controllers: [NetworksController], providers: [NetworksService] })
export class NetworksModule {}
