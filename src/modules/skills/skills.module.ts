import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';
import { Skill } from './entities/skill.entity';
import { SkillType } from './entities/skill-type.entity';
import { SkillTypesController } from './skill-types.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Skill, SkillType]),
  ],
  controllers: [SkillsController, SkillTypesController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
