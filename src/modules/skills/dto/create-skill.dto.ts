import { IsString, IsNotEmpty } from 'class-validator';

export class CreateSkillDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  skill: string;
}

