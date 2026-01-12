import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateVariantsService } from './rate-variants.service';
import { RateVariantsController } from './rate-variants.controller';
import { RateVariant } from './entities/rate-variant.entity';
import { ProjectRateVariantRate } from '../projects/entities/project-rate-variant-rate.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RateVariant, ProjectRateVariantRate])],
  controllers: [RateVariantsController],
  providers: [RateVariantsService],
  exports: [RateVariantsService],
})
export class RateVariantsModule {}



