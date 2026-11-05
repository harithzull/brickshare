import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { SessionGuard } from "../auth/auth.module";
import { AuthRequest } from "../auth/auth.service";
import {
  ArchiveDto,
  AssociateDto,
  DraftDto,
  EditDraftDto,
  PublishDto,
  UploadDto,
} from "./studio.dto";
import { StudioService } from "./studio.service";
import { LocalStudioStorage, StudioStorage } from "./storage";
import { StudioProvenance } from "./provenance";
const uuid = () => new ParseUUIDPipe({ version: "4" });
function serve(response: Response, result: { asset: any; bytes: Buffer }) {
  response.setHeader("Content-Type", result.asset.mime_type);
  response.setHeader("Content-Length", result.bytes.length);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader(
    "Content-Security-Policy",
    "sandbox; default-src 'none'; frame-ancestors 'none'",
  );
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Cross-Origin-Resource-Policy", "same-site");
  response.setHeader(
    "Content-Disposition",
    `${result.asset.kind === "image" ? "inline" : "attachment"}; filename="${result.asset.id}.${result.asset.kind === "image" ? "webp" : result.asset.mime_type === "application/pdf" ? "pdf" : "txt"}"`,
  );
  response.send(result.bytes);
}
@Controller("api/v1/organizations/:orgId/studio/records")
@UseGuards(SessionGuard)
export class StudioController {
  constructor(private readonly studio: StudioService) {}
  @Get() list(@Param("orgId", uuid()) org: string, @Req() req: AuthRequest) {
    return this.studio.list(org, req);
  }
  @Post() create(
    @Param("orgId", uuid()) org: string,
    @Body() body: DraftDto,
    @Req() req: AuthRequest,
  ) {
    return this.studio.create(org, body, req);
  }
  @Get(":id") detail(
    @Param("orgId", uuid()) org: string,
    @Param("id", uuid()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.studio.detail(org, id, req);
  }
  @Patch(":id/draft") edit(
    @Param("orgId", uuid()) org: string,
    @Param("id", uuid()) id: string,
    @Body() body: EditDraftDto,
    @Req() req: AuthRequest,
  ) {
    return this.studio.edit(org, id, body, req);
  }
  @Post(":id/revisions") revise(
    @Param("orgId", uuid()) org: string,
    @Param("id", uuid()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.studio.revise(org, id, req);
  }
  @Post(":id/association") associate(
    @Param("orgId", uuid()) org: string,
    @Param("id", uuid()) id: string,
    @Body() body: AssociateDto,
    @Req() req: AuthRequest,
  ) {
    return this.studio.associate(org, id, body.propertyId, req);
  }
  @Post(":id/publish") publish(
    @Param("orgId", uuid()) org: string,
    @Param("id", uuid()) id: string,
    @Body() body: PublishDto,
    @Req() req: AuthRequest,
  ) {
    return this.studio.publish(org, id, body, req);
  }
  @Post(":id/archive") archive(
    @Param("orgId", uuid()) org: string,
    @Param("id", uuid()) id: string,
    @Body() _body: ArchiveDto,
    @Req() req: AuthRequest,
  ) {
    return this.studio.archive(org, id, req);
  }
  @Post(":id/assets") upload(
    @Param("orgId", uuid()) org: string,
    @Param("id", uuid()) id: string,
    @Body() body: UploadDto,
    @Req() req: AuthRequest,
  ) {
    return this.studio.upload(org, id, body, req);
  }
  @Get(":id/assets/:assetId") async asset(
    @Param("orgId", uuid()) org: string,
    @Param("id", uuid()) id: string,
    @Param("assetId", uuid()) assetId: string,
    @Req() req: AuthRequest,
    @Res() response: Response,
  ) {
    serve(response, await this.studio.privateAsset(org, id, assetId, req));
  }
}
@Controller("api/v1/media")
export class StudioMediaController {
  constructor(private readonly studio: StudioService) {}
  @Get(":id") async asset(
    @Param("id", uuid()) id: string,
    @Res() response: Response,
  ) {
    serve(response, await this.studio.publicAsset(id));
  }
}
@Controller("api/v1/organizations/:orgId/studio/candidates")
@UseGuards(SessionGuard)
export class StudioCandidatesController {
  constructor(private readonly studio: StudioService) {}
  @Get() list(@Param("orgId", uuid()) org: string, @Req() req: AuthRequest) {
    return this.studio.candidates(org, req);
  }
}
@Module({
  controllers: [
    StudioController,
    StudioMediaController,
    StudioCandidatesController,
  ],
  providers: [
    StudioService,
    StudioProvenance,
    { provide: StudioStorage, useClass: LocalStudioStorage },
  ],
})
export class StudioModule {}
