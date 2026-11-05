import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateBy } from 'class-validator';

const pageNumber = ({ value }: { value: unknown }) => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
export class SourceQuery {
  @IsIn(['blockchain', 'fictional']) source: 'blockchain' | 'fictional' = 'blockchain';
}
export class PropertiesQuery extends SourceQuery {
  @Transform(pageNumber) @IsInt() @Min(1) @Max(10000) page = 1;
  @Transform(pageNumber) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsUUID('4') deploymentId?: string;
  @IsOptional() @IsString() @ValidateBy({ name: 'positiveInt64', validator: { validate: value => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n, defaultMessage: () => 'chainId must be a positive signed 64-bit decimal integer string' } }) chainId?: string;
}
