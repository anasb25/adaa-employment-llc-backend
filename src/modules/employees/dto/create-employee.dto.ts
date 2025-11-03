import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { EmployeeStatus } from '../entities/employee.entity';

export class CreateEmployeeDto {
  @IsString()
  adaa_emp_code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  pp_no?: string;

  @IsOptional()
  @IsDateString()
  pp_expiry?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  emirates_id?: string;

  @IsOptional()
  @IsDateString()
  emirates_id_expiry?: string;

  @IsOptional()
  @IsDateString()
  visa_expiry?: string;

  @IsOptional()
  @IsString()
  work_permit_no?: string;

  @IsOptional()
  @IsDateString()
  work_permit_expiry?: string;

  @IsOptional()
  @IsString()
  personal_code?: string;

  @IsOptional()
  @IsString()
  contact_no?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsDateString()
  date_of_joining?: string;

  @IsOptional()
  @IsDateString()
  date_of_arrival?: string;
}
