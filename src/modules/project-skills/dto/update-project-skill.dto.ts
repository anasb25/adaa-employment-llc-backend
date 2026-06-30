import { IsNumber, IsOptional } from 'class-validator';

export class UpdateProjectSkillDto {
  @IsOptional()
  @IsNumber()
  sale_price?: number;
}
