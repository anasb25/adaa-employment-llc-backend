import { IsNotEmpty, IsString, IsNumber, IsOptional, IsObject } from 'class-validator';

export class CreatePayrollDto {
  @IsNotEmpty()
  @IsNumber()
  employeeId: number;

  @IsNotEmpty()
  @IsString()
  month: string; // Format: YYYY-MM

  @IsOptional()
  @IsNumber()
  totalHours?: number;

  @IsOptional()
  @IsNumber()
  totalOtHours?: number;

  @IsOptional()
  @IsNumber()
  totalOffdaysWorkedHours?: number;

  @IsOptional()
  @IsNumber()
  totalIdleDayHours?: number;

  @IsOptional()
  @IsObject()
  allowances?: Record<string, any>;

  @IsOptional()
  @IsObject()
  arrears?: Record<string, any>;

  @IsOptional()
  @IsNumber()
  absentDaysDeductible?: number;

  @IsOptional()
  @IsObject()
  otherDeductions?: Record<string, any>;

  @IsOptional()
  @IsString()
  notes?: string;
}

