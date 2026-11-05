import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Property } from '../database/entities';
import { AssetsService } from '../assets/assets.module';
import { PropertiesQuery, SourceQuery } from './query.dto';

const hex = (buffer: Buffer | null | undefined) => buffer ? `0x${buffer.toString('hex')}` : null;
const literalLike = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

@Injectable()
export class PropertiesService {
  constructor(private readonly database: DatabaseService, private readonly assets: AssetsService) {}
  private query(source: string) {
    return this.database.source.getRepository(Property).createQueryBuilder('property')
      .leftJoinAndSelect('property.deployment', 'deployment')
      .leftJoinAndSelect('deployment.chain', 'chain')
      .leftJoinAndSelect('property.metadataVersions', 'metadata', 'metadata.state = :published', { published: 'published' })
      .leftJoinAndSelect('metadata.assets', 'link')
      .leftJoinAndSelect('link.asset', 'asset', 'asset.state = :assetState', { assetState: 'published' })
      .where('property.source = :source', { source });
  }
  async list(query: PropertiesQuery) {
    await this.database.requireReady();
    const builder = this.query(query.source);
    if (query.q?.trim()) builder.andWhere('(property.chainName ILIKE :search OR property.chainLocation ILIKE :search OR metadata.title ILIKE :search OR metadata.location ILIKE :search)', { search: literalLike(query.q.trim()) });
    if (query.location) builder.andWhere('(property.chainLocation = :location OR metadata.location = :location)', { location: query.location });
    if (query.deploymentId) builder.andWhere('property.deploymentId = :deploymentId', { deploymentId: query.deploymentId });
    if (query.chainId) builder.andWhere('chain.chainId = :chainId', { chainId: query.chainId });
    const [rows, total] = await builder.orderBy('property.createdAt', 'ASC').addOrderBy('property.id', 'ASC').skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return { data: rows.map(row => this.present(row)), meta: { ...this.meta(query.source), page: query.page, limit: query.limit, total } };
  }
  async find(id: string, query: SourceQuery) {
    await this.database.requireReady();
    const row = await this.query(query.source).andWhere('property.id = :id', { id }).getOne();
    if (!row) throw new NotFoundException('Property not found in the selected source');
    return { data: this.present(row), meta: this.meta(query.source) };
  }
  private meta(source: string) {
    return { source, synchronization: 'not_implemented', blockchainAuthority: 'wallet_and_smart_contract', note: 'No chain ingestion or independent snapshot verification is implemented by this API.' };
  }
  private present(property: Property) {
    const metadata = property.metadataVersions?.[0];
    return {
      id: property.id, source: property.source, isFictional: property.source === 'fictional', fixtureLabel: property.fixtureLabel,
      blockchain: property.source === 'fictional' ? null : {
        source: 'unverified_database_snapshot', verifiedByApi: false,
        deploymentId: property.deploymentId, chainId: property.deployment?.chain?.chainId, contractAddress: hex(property.deployment?.address),
        onChainId: property.onChainId, name: property.chainName, location: property.chainLocation,
        totalTokens: property.totalTokens, availableTokens: property.availableTokens, tokenPriceWei: property.tokenPriceWei, active: property.active,
        observedBlock: property.observedBlock, observedBlockHash: hex(property.observedBlockHash),
      },
      metadata: metadata ? {
        source: 'operator_metadata', version: metadata.version, title: metadata.title, location: metadata.location, description: metadata.description,
        publicationState: metadata.state, updatedAt: metadata.updatedAt.toISOString(),
        assets: (metadata.assets || []).filter(link => link.asset).sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id)).map(link => this.assets.present(link)),
      } : null,
    };
  }
}
