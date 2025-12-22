import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class MonthlyTimesheetDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @Type(() => Number)
  @IsNumber()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  projectId?: number;
}

export interface EmployeeDailyStatus {
  [day: number]: string; // day number (1-31) -> job status abbreviation
}

export interface MonthlyTimesheetEmployee {
  srNo: number;
  employeeId: number;
  idNo: string;
  name: string;
  trade: string;
  dailyStatuses: EmployeeDailyStatus;
}

export interface MonthlyTimesheetProject {
  projectId: number;
  projectName: string;
  clientName: string;
  employees: MonthlyTimesheetEmployee[];
}

export interface MonthlyTimesheetResponse {
  month: number;
  year: number;
  daysInMonth: number;
  projects: MonthlyTimesheetProject[];
}

