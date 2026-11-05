import { Type, Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  Equals,
} from "class-validator";
export class CharacteristicsDto {
  @IsOptional()
  @IsIn(["apartment", "house", "commercial", "land", "other"])
  propertyType?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) bedrooms?: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(100)
  bathrooms?: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1000000)
  areaSqm?: number;
  @IsOptional() @IsInt() @Min(1600) @Max(2200) yearBuilt?: number;
}
export class DraftDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(3, 160)
  title!: string;
  @IsString() @MaxLength(200) location = "";
  @IsString() @MaxLength(10000) description = "";
  @Type(() => CharacteristicsDto)
  @ValidateNested()
  characteristics: CharacteristicsDto = {};
}
export class AttachmentDto {
  @IsUUID("4") assetId!: string;
  @IsIn(["hero", "gallery", "supporting_document"]) purpose!: string;
  @IsString() @MaxLength(240) altText = "";
  @IsString() @MaxLength(240) caption = "";
}
export class EditDraftDto extends DraftDto {
  @IsInt() @Min(1) expectedRevision!: number;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  assets: AttachmentDto[] = [];
}
export class AssociateDto {
  @IsUUID("4") propertyId!: string;
}
export class PublishDto {
  @IsInt() @Min(1) expectedRevision!: number;
  @IsBoolean() @Equals(true) confirmPublication!: boolean;
}
export class ArchiveDto {
  @IsBoolean() @Equals(true) confirmArchive!: boolean;
}
export class UploadDto {
  @IsString() @Length(1, 120) name!: string;
  @IsIn([
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
    "text/plain",
  ])
  mimeType!: string;
  @IsString() @MaxLength(1398104) base64!: string;
}
