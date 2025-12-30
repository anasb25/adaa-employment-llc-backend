import { PartialType } from '@nestjs/mapped-types';
import { CreateRateVariantDto } from './create-rate-variant.dto';

export class UpdateRateVariantDto extends PartialType(CreateRateVariantDto) {}


