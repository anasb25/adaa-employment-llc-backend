import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectSkillsController } from './project-skills.controller';
import { ProjectSkillsService } from './project-skills.service';
import { ProjectSkill } from './entities/project-skill.entity';
import { Project } from '../projects/entities/project.entity';
import { Skill } from '../skills/entities/skill.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectSkill,
      Project,
      Skill,
    ]),
  ],
  controllers: [ProjectSkillsController],
  providers: [ProjectSkillsService],
  exports: [ProjectSkillsService],
})
export class ProjectSkillsModule {}
