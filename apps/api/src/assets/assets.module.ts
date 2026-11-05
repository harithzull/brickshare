import { Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Environment } from '../config/environment';
import { PropertyAsset } from '../database/entities';

// Presentation only. Uploads, storage access and publication authorization are deferred.
@Injectable()
export class AssetsService {
  constructor(private readonly config: ConfigService) {}
  present(link: PropertyAsset) {
    const base = this.config.getOrThrow<Environment>('validated').ASSET_PUBLIC_BASE_URL;
    return {
      id: link.assetId, kind: link.asset.kind, mimeType: link.asset.mimeType, byteSize: link.asset.byteSize,
      sha256: `0x${link.asset.sha256.toString('hex')}`, purpose: link.purpose, altText: link.altText, caption: link.caption,
      url: base ? `${base.replace(/\/$/, '')}/${link.asset.objectKey.split('/').map(encodeURIComponent).join('/')}` : null,
      availability: base ? 'configured_external_reference' : 'not_served_by_api',
    };
  }
}
@Module({ providers: [AssetsService], exports: [AssetsService] })
export class AssetsModule {}
