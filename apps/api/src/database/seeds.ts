import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { apiRoot, Environment } from '../config/environment';
import { Chain, Property, PropertyAsset, PropertyMetadataVersion, PublicAsset } from './entities';

export async function seedNetworks(source: DataSource) {
  const networks = JSON.parse(readFileSync(join(apiRoot, '../../config/networks.json'), 'utf8')) as Record<string, { chainId: number; name: string; explorerUrl: string | null }>;
  await source.transaction(async manager => {
    for (const network of Object.values(networks)) {
      await manager.createQueryBuilder().insert().into(Chain).values({ chainId: String(network.chainId), name: network.name, explorerUrl: network.explorerUrl, enabled: true }).orIgnore().execute();
    }
  });
}

export const fictionalPropertyId = 'f1c71000-0000-4000-8000-000000000001';
export async function seedFictional(source: DataSource, env: Environment) {
  if (env.NODE_ENV === 'production' || !env.ALLOW_FICTIONAL_SEED) throw new Error('Fictional seed requires non-production NODE_ENV and ALLOW_FICTIONAL_SEED=true.');
  await source.transaction(async manager => {
    // Serialize repeat invocations; never overwrite published content.
    await manager.query('SELECT pg_advisory_xact_lock(2042001)');
    if (await manager.existsBy(Property, { id: fictionalPropertyId })) return;
    const property = await manager.save(Property, manager.create(Property, { id: fictionalPropertyId, source: 'fictional', fixtureLabel: 'FICTIONAL development fixture — not an investment or on-chain listing' }));
    const metadata = await manager.save(PropertyMetadataVersion, manager.create(PropertyMetadataVersion, {
      propertyId: property.id, version: 1, state: 'draft', title: 'Fictional Cedar House', location: 'Example City (fictional)',
      description: 'Fictional test property for API development only. No property rights, blockchain deployment, price, supply or investment opportunity is represented.',
      authorReference: 'development-fixture-unverified',
    }));
    const contents = readFileSync(join(apiRoot, 'fixtures/fictional-overview.txt'));
    const asset = await manager.save(PublicAsset, manager.create(PublicAsset, {
      objectKey: 'fixtures/fictional-overview.txt', mimeType: 'text/plain', byteSize: String(contents.length), sha256: createHash('sha256').update(contents).digest(),
      kind: 'document', state: 'published', createdByReference: 'development-fixture-unverified',
    }));
    await manager.save(PropertyAsset, manager.create(PropertyAsset, { metadataVersionId: metadata.id, assetId: asset.id, purpose: 'supporting_document', caption: 'Fictional development document; not served by this API.', displayOrder: 0 }));
    metadata.state = 'published';
    await manager.save(metadata);
  });
}
