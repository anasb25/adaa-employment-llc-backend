import { IsString, IsOptional, IsDateString, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

// Convert empty string to undefined so @IsOptional() skips validation for optional date fields
const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class CreateEmployeeDto {
  @IsString()
  adaa_emp_code: string;

  @IsString()
  name: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  pp_no?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  pp_expiry?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  emirates_id?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  emirates_id_expiry?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  visa_expiry?: string;

  @IsOptional()
  @IsString()
  work_permit_no?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  work_permit_expiry?: string;

  @IsOptional()
  @IsString()
  personal_code?: string;

  @IsOptional()
  @IsString()
  contact_no?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  date_of_joining?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  date_of_arrival?: string;

  @IsOptional()
  @IsNumber()
  basic_salary?: number;

  @IsOptional()
  @IsNumber()
  hra?: number;

  @IsOptional()
  @IsNumber()
  other_allowance?: number;

  @IsOptional()
  @IsNumber()
  air_tickets?: number;

  @IsOptional()
  @IsNumber()
  annual_leave_balance?: number;
}
