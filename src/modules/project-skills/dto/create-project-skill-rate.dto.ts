import {
  IsInt,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RateType } from '../entities/project-skill-rate.entity';

export class CreateProjectSkillRateDto {
  @IsInt()
  projectId: number;

  @IsInt()
  skillId: number;

  @IsInt()
  rateVariantId: number;

  @IsEnum(RateType)
  rateType: RateType;

  @IsNumber()
  @Min(0)
  rateValue: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkCreateProjectSkillRatesDto {
  @IsInt()
  projectId: number;

  @IsInt()
  skillId: number;

  rates: Array<{
    rateVariantId: number;
    rateType: RateType;
    rateValue: number;
    notes?: string;
  }>;
}


