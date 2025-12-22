import { IsString, IsOptional, IsEnum } from 'class-validator';
import { TimesheetStatus } from '../entities/timesheet.entity';

export class UpdateTimesheetDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitTimesheetDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApproveTimesheetDto {
  @IsEnum(TimesheetStatus)
  status: TimesheetStatus.APPROVED | TimesheetStatus.REJECTED;

  @IsOptional()
  @IsString()
  notes?: string;
}
