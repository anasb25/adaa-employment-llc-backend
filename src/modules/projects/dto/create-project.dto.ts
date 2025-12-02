import { IsString, IsOptional, IsNotEmpty, IsInt, IsIn } from 'class-validator';
import { ProjectStatus, ProjectFAT } from '../entities/project.entity';

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

  @IsString()
  @IsOptional()
  @IsIn([ProjectFAT.ADAA, ProjectFAT.CLIENT])
  fat?: ProjectFAT;

  @IsInt()
  clientId: number;
}


