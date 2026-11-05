import { Controller, Get, Module, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { AssetsModule } from '../assets/assets.module';
import { PropertiesQuery, SourceQuery } from './query.dto';

@Controller('api/v1/properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}
  @Get() list(@Query() query: PropertiesQuery) { return this.properties.list(query); }
  @Get(':id') find(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Query() query: SourceQuery) { return this.properties.find(id, query); }
}
@Module({ imports: [AssetsModule], controllers: [PropertiesController], providers: [PropertiesService] })
export class PropertiesModule {}
