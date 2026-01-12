import {
  IsString,
  IsInt,
  IsDateString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus } from '../entities/invoice.entity';

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string; // If not provided, will be auto-generated

  @IsInt()
  projectId: number;

  @IsString()
  month: string; // Format: YYYY-MM

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class GenerateInvoiceDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string; // If not provided, will be auto-generated

  @IsInt()
  projectId: number;

  @IsString()
  month: string; // Format: YYYY-MM
}

