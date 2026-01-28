import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ContractType,
  SettlementStatus,
} from '../entities/settlement.entity';

export class PaymentItemDto {
  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  forDays?: number;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsNumber()
  amount: number;
}

export class DeductionItemDto {
  @IsString()
  description: string;

  @IsNumber()
  amount: number;
}

export class CreateSettlementDto {
  @IsInt()
  employeeId: number;

  @IsString()
  empCode: string;

  @IsString()
  empName: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsDateString()
  dateOfJoin?: string;

  @IsOptional()
  @IsDateString()
  lastDateOfWork?: string;

  @IsOptional()
  @IsNumber()
  lastTotalSalary?: number;

  @IsOptional()
  @IsInt()
  totalDaysAbsent?: number;

  @IsBoolean()
  eligibleForGratuity: boolean;

  @IsOptional()
  @IsInt()
  gratuityDaysPerYear?: number;

  @IsOptional()
  @IsString()
  gratuityReason?: string;

  @IsOptional()
  @IsNumber()
  hourlySalary?: number;

  @IsOptional()
  @IsNumber()
  hourlyRate?: number;

  @IsOptional()
  @IsNumber()
  allowance?: number;

  @IsOptional()
  @IsNumber()
  transportAllowance?: number;

  @IsOptional()
  @IsNumber()
  otherAllowances?: number;

  @IsOptional()
  @IsNumber()
  totalYearsOfService?: number;

  @IsOptional()
  @IsNumber()
  annualLeaveBalance?: number;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentItemDto)
  paymentItems: PaymentItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeductionItemDto)
  deductionItems: DeductionItemDto[];

  @IsOptional()
  @IsString()
  passportNo?: string;

  @IsOptional()
  @IsEnum(SettlementStatus)
  status?: SettlementStatus;
}
