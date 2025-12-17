import {
  IsNumber,
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceStatus } from '../entities/timesheet.entity';

export class CreateTimesheetDto {
  @IsOptional()
  @IsNumber()
  allocationId?: number; // Optional for idle employees

  @IsOptional()
  @IsNumber()
  employeeId?: number; // Required for idle employees (when no allocation)

  @IsDateString()
  date: string;

  // Status removed - use mobilization data instead
  // @IsOptional()
  // @IsEnum(AttendanceStatus)
  // status?: AttendanceStatus;

  @IsOptional()
  @IsNumber()
  tradeInSiteId?: number;

  @IsNumber()
  @Min(0)
  hoursWorked: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkCreateTimesheetDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTimesheetDto)
  timesheets: CreateTimesheetDto[];
}

