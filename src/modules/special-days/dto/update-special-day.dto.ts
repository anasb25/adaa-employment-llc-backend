import { PartialType } from '@nestjs/mapped-types';
import { CreateSpecialDayDto } from './create-special-day.dto';

export class UpdateSpecialDayDto extends PartialType(CreateSpecialDayDto) {}

