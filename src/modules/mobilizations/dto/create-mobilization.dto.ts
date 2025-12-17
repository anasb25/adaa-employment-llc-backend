import {
  IsNumber,
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsArray,
} from 'class-validator';
import {
  MobilizationStatus,
  MobStatus,
  JobStatus,
} from '../entities/mobilization.entity';

export class CreateMobilizationDto {
  @IsNumber()
  employeeId: number;

  @IsNumber()
  mobilizedTradeId: number; // Skill ID they are mobilized as

  @IsOptional()
  @IsNumber()
  projectId?: number | null; // Can be null if demobilized

  @IsOptional()
  @IsEnum(MobilizationStatus)
  status?: MobilizationStatus;

  @IsEnum(MobStatus)
  mobStatus: MobStatus;

  @IsEnum(JobStatus)
  jobStatus: JobStatus;

  @IsDateString()
  actionDate: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkCreateMobilizationDto {
  @IsArray()
  @IsNumber({}, { each: true })
  employeeIds: number[];

  @IsNumber()
  mobilizedTradeId: number;

  @IsOptional()
  @IsNumber()
  projectId?: number | null;

  @IsOptional()
  @IsEnum(MobilizationStatus)
  status?: MobilizationStatus;

  @IsEnum(MobStatus)
  mobStatus: MobStatus;

  @IsEnum(JobStatus)
  jobStatus: JobStatus;

  @IsDateString()
  actionDate: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

