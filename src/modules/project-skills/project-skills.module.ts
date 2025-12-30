import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectSkillsController } from './project-skills.controller';
import { ProjectSkillsService } from './project-skills.service';
import { ProjectSkill } from './entities/project-skill.entity';
import { ProjectSkillRate } from './entities/project-skill-rate.entity';
import { Project } from '../projects/entities/project.entity';
import { Skill } from '../skills/entities/skill.entity';
import { SkillRate } from '../skills/entities/skill-rate.entity';
import { RateVariantsModule } from '../rate-variants/rate-variants.module';
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectSkill,
      ProjectSkillRate,
      Project,
      Skill,
      SkillRate,
      RateVariant,
    ]),
    RateVariantsModule,
  ],
  controllers: [ProjectSkillsController],
  providers: [ProjectSkillsService],
  exports: [ProjectSkillsService],
})
export class ProjectSkillsModule {}
