import { IsOptional, IsString, IsDateString } from 'class-validator';

export class SpecialDayFiltersDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  year?: number;
}

