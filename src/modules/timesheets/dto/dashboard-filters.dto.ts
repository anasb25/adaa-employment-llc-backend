import { IsOptional, IsDateString } from 'class-validator';

export class DashboardFiltersDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

