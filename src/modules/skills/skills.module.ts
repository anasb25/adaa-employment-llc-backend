import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';
import { Skill } from './entities/skill.entity';
import { SkillType } from './entities/skill-type.entity';
import { SkillRate } from './entities/skill-rate.entity';
import { SkillTypesController } from './skill-types.controller';
import { RateVariantsModule } from '../rate-variants/rate-variants.module';
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Skill, SkillType, SkillRate, RateVariant]),
    RateVariantsModule,
  ],
  controllers: [SkillsController, SkillTypesController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
