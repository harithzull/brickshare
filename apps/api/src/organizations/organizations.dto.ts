import { Transform } from 'class-transformer';
import { IsEthereumAddress, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
export class OrganizationNameDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(3) @MaxLength(100) name!: string;
}
export class InvitationDto {
  @IsEthereumAddress() address!: string;
  @IsIn(['editor', 'viewer']) role!: 'editor' | 'viewer';
}
export class MembershipRoleDto { @IsIn(['owner', 'editor', 'viewer']) role!: 'owner' | 'editor' | 'viewer'; }
