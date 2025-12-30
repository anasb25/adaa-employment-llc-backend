import { PartialType } from '@nestjs/mapped-types';
import { CreatePayrollDto } from './create-payroll.dto';
import { IsOptional, IsNumber, IsString, IsObject } from 'class-validator';

export class UpdatePayrollDto extends PartialType(CreatePayrollDto) {
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

