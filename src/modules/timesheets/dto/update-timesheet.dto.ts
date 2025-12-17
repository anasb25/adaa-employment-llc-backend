import {
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  Min,
} from 'class-validator';
import { AttendanceStatus } from '../entities/timesheet.entity';

export class UpdateTimesheetDto {
  // Status removed - use mobilization data instead
  // @IsOptional()
  // @IsEnum(AttendanceStatus)
  // status?: AttendanceStatus;

  @IsOptional()
  @IsNumber()
  tradeInSiteId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hoursWorked?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

