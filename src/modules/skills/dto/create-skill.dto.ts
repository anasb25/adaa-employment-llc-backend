import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class CreateSkillDto {
  @IsInt()
  @IsNotEmpty()
  skillTypeId: number;

  @IsString()
  @IsNotEmpty()
  skill: string;

  @IsOptional()
  @IsNumber()
  cost_price?: number;

  @IsOptional()
  @IsNumber()
  sale_price?: number;
}
