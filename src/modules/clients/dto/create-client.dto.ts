import { IsString, IsOptional, IsEmail, IsNotEmpty, IsIn } from 'class-validator';
import { PaymentTerms } from '../entities/client.entity';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsString()
  @IsOptional()
  contactNumber?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  @IsIn([PaymentTerms.DAYS_15, PaymentTerms.DAYS_30, PaymentTerms.DAYS_45, PaymentTerms.DAYS_60])
  paymentTerms?: PaymentTerms;

  @IsString()
  @IsOptional()
  trn?: string;
}


