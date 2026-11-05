import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthRequest } from '../auth/auth.service';
import { SessionGuard } from '../auth/auth.module';
import { OrganizationsService } from './organizations.service';
import { InvitationDto, MembershipRoleDto, OrganizationNameDto } from './organizations.dto';
const uuid = () => new ParseUUIDPipe({ version: '4' });
@Controller('api/v1') @UseGuards(SessionGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}
  @Get('organizations') list(@Req() request: AuthRequest) { return this.organizations.list(request); }
  @Post('organizations') create(@Body() body: OrganizationNameDto, @Req() request: AuthRequest) { return this.organizations.create(body, request); }
  @Get('organizations/:id') get(@Param('id', uuid()) id: string, @Req() request: AuthRequest) { return this.organizations.get(id, request); }
  @Patch('organizations/:id') rename(@Param('id', uuid()) id: string, @Body() body: OrganizationNameDto, @Req() request: AuthRequest) { return this.organizations.rename(id, body, request); }
  @Get('organizations/:id/members') members(@Param('id', uuid()) id: string, @Req() request: AuthRequest) { return this.organizations.members(id, request); }
  @Patch('organizations/:id/members/:memberId') role(@Param('id', uuid()) id: string, @Param('memberId', uuid()) memberId: string, @Body() body: MembershipRoleDto, @Req() request: AuthRequest) { return this.organizations.changeRole(id, memberId, body, request); }
  @Delete('organizations/:id/members/:memberId') remove(@Param('id', uuid()) id: string, @Param('memberId', uuid()) memberId: string, @Req() request: AuthRequest) { return this.organizations.removeMember(id, memberId, request); }
  @Get('organizations/:id/invitations') invitations(@Param('id', uuid()) id: string, @Req() request: AuthRequest) { return this.organizations.invitations(id, request); }
  @Post('organizations/:id/invitations') invite(@Param('id', uuid()) id: string, @Body() body: InvitationDto, @Req() request: AuthRequest) { return this.organizations.invite(id, body, request); }
  @Delete('organizations/:id/invitations/:invitationId') revoke(@Param('id', uuid()) id: string, @Param('invitationId', uuid()) invitationId: string, @Req() request: AuthRequest) { return this.organizations.revoke(id, invitationId, request); }
  @Get('organizations/:id/audit') audit(@Param('id', uuid()) id: string, @Req() request: AuthRequest) { return this.organizations.audit(id, request); }
  @Get('invitations') inbox(@Req() request: AuthRequest) { return this.organizations.inbox(request); }
  @Post('invitations/:id/accept') accept(@Param('id', uuid()) id: string, @Req() request: AuthRequest) { return this.organizations.accept(id, request); }
  @Get('platform/organizations') directory(@Req() request: AuthRequest) { return this.organizations.platformDirectory(request); }
}
@Module({ controllers: [OrganizationsController], providers: [OrganizationsService] })
export class OrganizationsModule {}
