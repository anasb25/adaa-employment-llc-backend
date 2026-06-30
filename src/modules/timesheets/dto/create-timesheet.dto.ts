import {
  IsNumber,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TimesheetEntryDto {
  @IsNumber()
  employeeId: number;

  @IsString()
  date: string;

  @IsOptional()
  @IsNumber()
  tradeInSiteId?: number;

  @IsNumber()
  hoursWorked: number;

  @IsString()
  jobStatus: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTimesheetDto {
  @IsOptional()
  @IsNumber()
  projectId?: number | null; // null = idle employees timesheet

  @IsString()
  month: string; // Format: YYYY-MM

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SaveTimesheetEntriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimesheetEntryDto)
  entries: TimesheetEntryDto[];
}
