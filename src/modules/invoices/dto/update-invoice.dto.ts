import { PartialType } from '@nestjs/mapped-types';
import { CreateInvoiceDto } from './create-invoice.dto';
import { IsEnum, IsOptional, IsDateString, IsString, IsInt, IsArray } from 'class-validator';
import { InvoiceStatus } from '../entities/invoice.entity';

export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsArray()
  lineItems?: any[];

  @IsOptional()
  @IsDateString()
  paidDate?: string;

  @IsOptional()
  @IsString()
  paymentReference?: string;
}

export class ApproveInvoiceDto {
  @IsInt()
  invoiceId: number;
}

export class MarkAsPaidDto {
  @IsDateString()
  paidDate: string;

  @IsOptional()
  @IsString()
  paymentReference?: string;
}

