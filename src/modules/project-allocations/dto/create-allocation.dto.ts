import {
  IsNumber,
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAllocationDto {
  @IsNumber()
  projectId: number;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  employeeIds: number[];

  @IsOptional()
  @IsString()
  notes?: string;
}
