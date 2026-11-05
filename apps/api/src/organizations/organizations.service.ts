import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DatabaseService } from '../database/database.module';
import { AuthRequest, SessionContext } from '../auth/auth.service';
import { addressBytes, audit, hexAddress } from '../auth/security';
import { InvitationDto, MembershipRoleDto, OrganizationNameDto } from './organizations.dto';

export type OrganizationRole = 'owner' | 'editor' | 'viewer';
export const permissions = (role: OrganizationRole) => ({ readMembers: true, editOrganization: role !== 'viewer', manageMembers: role === 'owner', manageInvitations: role === 'owner', readAudit: role === 'owner' });
const present = (row: any) => ({ id: row.id, name: row.name, role: row.role as OrganizationRole, permissions: permissions(row.role), createdAt: row.created_at.toISOString() });

@Injectable()
export class OrganizationsService {
  constructor(private readonly database: DatabaseService) {}
  private async scoped(manager: EntityManager, id: string, actor: SessionContext, minimum: 'viewer' | 'editor' | 'owner' = 'viewer', lock = false) {
    if (lock) {
      // Lock the organization first, then re-read the role with a fresh statement.
      // Concurrent membership changes must not authorize through a stale join.
      await manager.query(`SELECT id FROM organizations WHERE id=$1 AND EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=$1 AND user_id=$2) FOR UPDATE`, [id, actor.userId]);
    }
    const [row] = await manager.query(`SELECT o.*,m.role FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id WHERE o.id=$1 AND m.user_id=$2`, [id, actor.userId]);
    if (!row) throw new NotFoundException('Organization not found');
    if ((minimum === 'owner' && row.role !== 'owner') || (minimum === 'editor' && row.role === 'viewer')) throw new ForbiddenException('Organization role does not permit this action');
    return row;
  }
  async list(request: AuthRequest) {
    const rows = await this.database.source.query(`SELECT o.*,m.role FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id WHERE m.user_id=$1 ORDER BY o.created_at,o.id LIMIT 100`, [request.sessionContext!.userId]);
    return { data: rows.map(present), meta: { limit: 100 } };
  }
  async get(id: string, request: AuthRequest) { return { data: present(await this.scoped(this.database.source.manager, id, request.sessionContext!)) }; }
  async create(body: OrganizationNameDto, request: AuthRequest) {
    const actor = request.sessionContext!;
    return this.database.source.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['organization-create:' + actor.userId]);
      const [{ count }] = await manager.query('SELECT count(*) FROM organizations WHERE created_by_user_id=$1', [actor.userId]);
      if (BigInt(count) >= 20n) throw new ConflictException('Local organization creation limit reached');
      const [org] = await manager.query('INSERT INTO organizations(name,created_by_user_id) VALUES($1,$2) RETURNING *', [body.name, actor.userId]);
      await manager.query(`INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'owner')`, [org.id, actor.userId]);
      await audit(manager, 'organization.created', actor.userId, org.id, request);
      return { data: present({ ...org, role: 'owner' }) };
    });
  }
  async rename(id: string, body: OrganizationNameDto, request: AuthRequest) {
    const actor = request.sessionContext!;
    return this.database.source.transaction(async manager => {
      const current = await this.scoped(manager, id, actor, 'editor', true);
      const [org] = await manager.query('WITH updated AS (UPDATE organizations SET name=$2 WHERE id=$1 RETURNING *) SELECT * FROM updated', [id, body.name]);
      await audit(manager, 'organization.updated', actor.userId, id, request);
      return { data: present({ ...org, role: current.role }) };
    });
  }
  async members(id: string, request: AuthRequest) {
    const org = await this.scoped(this.database.source.manager, id, request.sessionContext!);
    const rows = await this.database.source.query(`SELECT m.id,m.user_id,m.role,u.display_name,w.address,m.created_at FROM organization_memberships m JOIN users u ON u.id=m.user_id LEFT JOIN LATERAL(SELECT address FROM wallet_identities WHERE user_id=u.id ORDER BY verified_at DESC LIMIT 1) w ON true WHERE m.organization_id=$1 ORDER BY m.created_at,m.id LIMIT 1000`, [id]);
    return { data: rows.map((row: any) => ({ id: row.id, userId: row.user_id, role: row.role, displayName: row.display_name, address: row.address ? hexAddress(row.address) : null, joinedAt: row.created_at.toISOString() })), organization: present(org) };
  }
  async changeRole(orgId: string, membershipId: string, body: MembershipRoleDto, request: AuthRequest) {
    const actor = request.sessionContext!;
    return this.database.source.transaction(async manager => {
      await this.scoped(manager, orgId, actor, 'owner', true);
      const [member] = await manager.query('SELECT * FROM organization_memberships WHERE organization_id=$1 AND id=$2', [orgId, membershipId]);
      if (!member) throw new NotFoundException('Membership not found');
      await this.lastOwner(manager, orgId, member, body.role === 'owner');
      await manager.query('UPDATE organization_memberships SET role=$3 WHERE organization_id=$1 AND id=$2', [orgId, membershipId, body.role]);
      await audit(manager, 'membership.role_changed', actor.userId, orgId, request, { membershipId, role: body.role }, member.user_id);
      return { updated: true };
    });
  }
  async removeMember(orgId: string, membershipId: string, request: AuthRequest) {
    const actor = request.sessionContext!;
    return this.database.source.transaction(async manager => {
      await this.scoped(manager, orgId, actor, 'owner', true);
      const [member] = await manager.query('SELECT * FROM organization_memberships WHERE organization_id=$1 AND id=$2', [orgId, membershipId]);
      if (!member) throw new NotFoundException('Membership not found');
      await this.lastOwner(manager, orgId, member, false);
      await manager.query('DELETE FROM organization_memberships WHERE organization_id=$1 AND id=$2', [orgId, membershipId]);
      await audit(manager, 'membership.removed', actor.userId, orgId, request, { membershipId }, member.user_id);
      return { removed: true };
    });
  }
  private async lastOwner(manager: EntityManager, orgId: string, member: any, remainsOwner: boolean) {
    if (member.role === 'owner' && !remainsOwner) {
      const [{ count }] = await manager.query(`SELECT count(*) FROM organization_memberships WHERE organization_id=$1 AND role='owner' AND id<>$2`, [orgId, member.id]);
      if (BigInt(count) === 0n) throw new ConflictException('Promote another owner before changing the last owner');
    }
  }
  async invite(orgId: string, body: InvitationDto, request: AuthRequest) {
    const actor = request.sessionContext!; const address = addressBytes(body.address);
    return this.database.source.transaction(async manager => {
      await this.scoped(manager, orgId, actor, 'owner', true);
      if ((await manager.query(`SELECT 1 FROM organization_memberships m JOIN wallet_identities w ON w.user_id=m.user_id WHERE m.organization_id=$1 AND w.address=$2`, [orgId, address])).length) throw new ConflictException('Wallet is already a member');
      await manager.query('UPDATE organization_invitations SET revoked_at=now() WHERE organization_id=$1 AND expires_at<=now() AND accepted_at IS NULL AND revoked_at IS NULL', [orgId]);
      if ((await manager.query('SELECT 1 FROM organization_invitations WHERE organization_id=$1 AND address=$2 AND accepted_at IS NULL AND revoked_at IS NULL', [orgId, address])).length) throw new ConflictException('A pending invitation already exists');
      const [{ count }] = await manager.query('SELECT count(*) FROM organization_invitations WHERE organization_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL', [orgId]);
      if (BigInt(count) >= 100n) throw new ConflictException('Pending invitation limit reached');
      const [invite] = await manager.query(`INSERT INTO organization_invitations(organization_id,address,role,invited_by_user_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '2 days') RETURNING id,expires_at`, [orgId, address, body.role, actor.userId]);
      await audit(manager, 'invitation.created', actor.userId, orgId, request, { invitationId: invite.id, role: body.role });
      return { data: { id: invite.id, role: body.role, address: hexAddress(address), expiresAt: invite.expires_at.toISOString() } };
    });
  }
  async invitations(orgId: string, request: AuthRequest) {
    await this.scoped(this.database.source.manager, orgId, request.sessionContext!, 'owner');
    const rows = await this.database.source.query('SELECT id,address,role,expires_at FROM organization_invitations WHERE organization_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at LIMIT 100', [orgId]);
    return { data: rows.map((row: any) => ({ id: row.id, address: hexAddress(row.address), role: row.role, expiresAt: row.expires_at.toISOString() })) };
  }
  async inbox(request: AuthRequest) {
    const rows = await this.database.source.query(`SELECT i.id,i.role,i.expires_at,o.name FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.address=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() AND EXISTS(SELECT 1 FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=i.organization_id AND m.user_id=i.invited_by_user_id AND m.role='owner' AND u.status='active') ORDER BY i.created_at LIMIT 100`, [addressBytes(request.sessionContext!.address)]);
    return { data: rows.map((row: any) => ({ id: row.id, organizationName: row.name, role: row.role, expiresAt: row.expires_at.toISOString() })) };
  }
  async accept(invitationId: string, request: AuthRequest) {
    const actor = request.sessionContext!;
    return this.database.source.transaction(async manager => {
      const [initial] = await manager.query('SELECT organization_id FROM organization_invitations WHERE id=$1 AND address=$2', [invitationId, addressBytes(actor.address)]);
      if (!initial) throw new NotFoundException('Invitation not found');
      await manager.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [initial.organization_id]);
      const [invite] = await manager.query(`SELECT * FROM organization_invitations WHERE id=$1 AND address=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`, [invitationId, addressBytes(actor.address)]);
      if (!invite) throw new NotFoundException('Invitation is unavailable');
      if (!(await manager.query(`SELECT 1 FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.role='owner' AND u.status='active'`, [invite.organization_id, invite.invited_by_user_id])).length) throw new NotFoundException('Invitation is unavailable');
      // Existing membership is never upgraded or downgraded by a stale invitation.
      await manager.query(`INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(organization_id,user_id) DO NOTHING`, [invite.organization_id, actor.userId, invite.role]);
      await manager.query('UPDATE organization_invitations SET accepted_at=now(),accepted_by_user_id=$2 WHERE id=$1', [invitationId, actor.userId]);
      await audit(manager, 'invitation.accepted', actor.userId, invite.organization_id, request, { invitationId });
      return { organizationId: invite.organization_id };
    });
  }
  async revoke(orgId: string, invitationId: string, request: AuthRequest) {
    const actor = request.sessionContext!;
    return this.database.source.transaction(async manager => {
      await this.scoped(manager, orgId, actor, 'owner', true);
      const rows = await manager.query('WITH updated AS (UPDATE organization_invitations SET revoked_at=now() WHERE organization_id=$1 AND id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id) SELECT * FROM updated', [orgId, invitationId]);
      if (!rows.length) throw new NotFoundException('Invitation not found');
      await audit(manager, 'invitation.revoked', actor.userId, orgId, request, { invitationId });
      return { revoked: true };
    });
  }
  async audit(orgId: string, request: AuthRequest) {
    await this.scoped(this.database.source.manager, orgId, request.sessionContext!, 'owner');
    const rows = await this.database.source.query('SELECT id,action,actor_user_id,subject_user_id,details,created_at FROM security_audit_logs WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100', [orgId]);
    return { data: rows.map((row: any) => ({ id: row.id, action: row.action, actorUserId: row.actor_user_id, subjectUserId: row.subject_user_id, details: row.details, createdAt: row.created_at.toISOString() })) };
  }
  async platformDirectory(request: AuthRequest) {
    if (request.sessionContext!.platformRole !== 'platform_admin') throw new ForbiddenException('Platform administrator role required');
    const rows = await this.database.source.query('SELECT id,name,created_at FROM organizations ORDER BY created_at,id LIMIT 100');
    // This explicit platform capability does not bypass tenant member/audit guards.
    return { data: rows.map((row: any) => ({ id: row.id, name: row.name, createdAt: row.created_at.toISOString() })) };
  }
}
