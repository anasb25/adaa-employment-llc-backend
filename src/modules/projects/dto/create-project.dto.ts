import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsInt,
  IsIn,
  IsArray,
  IsBoolean,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProjectFAT } from '../entities/project.entity';

export class ProjectSpecialDayRateDto {
  @IsInt()
  specialDayId: number;

  @IsNumber()
  @Min(0)
  clientRateMultiplier: number;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class ProjectRateVariantRateDto {
  @IsInt()
  rateVariantId: number;

  @IsNumber()
  @Min(0)
  clientRateMultiplier: number;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  @IsIn([ProjectFAT.ADAA, ProjectFAT.CLIENT])
  fat?: ProjectFAT;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  offDays?: string[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  offDayMultiplier?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProjectSpecialDayRateDto)
  specialDayRates?: ProjectSpecialDayRateDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProjectRateVariantRateDto)
  rateVariantRates?: ProjectRateVariantRateDto[];

  @IsInt()
  clientId: number;
}


