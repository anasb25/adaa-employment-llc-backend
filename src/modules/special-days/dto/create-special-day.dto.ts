import {
  IsString,
  IsDateString,
  IsOptional,
  IsBoolean,
} from 'class-validator';

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
}

