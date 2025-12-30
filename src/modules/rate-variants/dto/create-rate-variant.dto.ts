import { IsString, IsBoolean, IsOptional, IsInt, Min, IsNumber } from 'class-validator';

export class CreateRateVariantDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isBaseRate?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  employeeRateMultiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minHours?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxHours?: number | null;
}


