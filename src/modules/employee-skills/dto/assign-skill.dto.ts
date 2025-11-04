import { IsNumber, IsInt, Min, Max } from 'class-validator';

export class AssignSkillDto {
  @IsNumber()
  skillId: number;

  @IsInt()
  @Min(0)
  @Max(10)
  rating: number;
}

