import { IsNumber, IsOptional } from 'class-validator';

export class AssignProjectSkillDto {
  @IsNumber()
  skillId: number;

  @IsOptional()
  @IsNumber()
  sale_price?: number;
}
