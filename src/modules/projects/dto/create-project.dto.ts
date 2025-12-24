import { IsString, IsOptional, IsNotEmpty, IsInt, IsIn, IsArray } from 'class-validator';
import { ProjectFAT } from '../entities/project.entity';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  @IsIn([ProjectFAT.ADAA, ProjectFAT.CLIENT])
  fat?: ProjectFAT;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  offDays?: string[];

  @IsInt()
  clientId: number;
}


