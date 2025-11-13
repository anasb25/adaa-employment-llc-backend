import { IsString, IsOptional, IsDateString } from 'class-validator';

export class UpdateAllocationDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
