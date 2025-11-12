import { IsString, IsNotEmpty, IsInt } from 'class-validator';

export class CreateSkillDto {
  @IsInt()
  @IsNotEmpty()
  skillTypeId: number;

  @IsString()
  @IsNotEmpty()
  skill: string;
}
