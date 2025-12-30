import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { Client } from '../clients/entities/client.entity';
import { ProjectSpecialDayRate } from './entities/project-special-day-rate.entity';
import { ProjectRateVariantRate } from './entities/project-rate-variant-rate.entity';
import { SpecialDay } from '../special-days/entities/special-day.entity';
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      Client,
      ProjectSpecialDayRate,
      ProjectRateVariantRate,
      SpecialDay,
      RateVariant,
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
