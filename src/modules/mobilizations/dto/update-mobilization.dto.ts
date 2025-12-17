import { PartialType } from '@nestjs/mapped-types';
import { CreateMobilizationDto } from './create-mobilization.dto';

export class UpdateMobilizationDto extends PartialType(CreateMobilizationDto) {}

