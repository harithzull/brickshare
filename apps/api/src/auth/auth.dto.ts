import { IsEthereumAddress, IsIn, IsInt, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
export class NonceDto {
  @IsEthereumAddress() address!: string;
  @IsInt() @IsIn([31337, 84532]) chainId!: number;
}
export class VerifyDto {
  @IsUUID('4') challengeId!: string;
  @IsString() @MinLength(1) @MaxLength(4096) message!: string;
  @IsString() @Matches(/^0x(?:[a-fA-F0-9]{128}|[a-fA-F0-9]{130})$/) signature!: string;
}
