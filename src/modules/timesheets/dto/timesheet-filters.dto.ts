import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';
import { TimesheetStatus } from '../entities/timesheet.entity';

export class TimesheetFiltersDto {
  @IsOptional()
  @IsNumber()
  projectId?: number;

  @IsOptional()
  @IsString()
  month?: string; // Format: YYYY-MM

  @IsOptional()
  @IsEnum(TimesheetStatus)
  status?: TimesheetStatus;
}
