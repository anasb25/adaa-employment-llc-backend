import { IsOptional, IsEnum, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import {
  MobStatus,
  JobStatus,
} from '../entities/mobilization.entity';

export class MobilizationFiltersDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  employeeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  projectId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mobilizedTradeId?: number;

  @IsOptional()
  @IsEnum(MobStatus)
  mobStatus?: MobStatus;

  @IsOptional()
  @IsEnum(JobStatus)
  jobStatus?: JobStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  actionDate?: string;
}


