import {
  IsString,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { SpecialDayType } from '../entities/special-day.entity';

export class CreateSpecialDayDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsEnum(SpecialDayType)
  dayType?: SpecialDayType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  clientRateMultiplier?: number; // Max 10x (1000% increase)

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  employeeRateMultiplier?: number; // Max 10x (1000% increase)

  @IsOptional()
  @IsBoolean()
  isDefaultOff?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
