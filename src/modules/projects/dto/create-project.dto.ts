import { IsString, IsOptional, IsNotEmpty, IsInt, IsIn } from 'class-validator';
import { ProjectStatus } from '../entities/project.entity';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    ProjectStatus.PLANNED,
    ProjectStatus.ONGOING,
    ProjectStatus.ON_HOLD,
    ProjectStatus.COMPLETED,
    ProjectStatus.CANCELLED,
  ])
  status?: ProjectStatus;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsInt()
  clientId: number;
}


