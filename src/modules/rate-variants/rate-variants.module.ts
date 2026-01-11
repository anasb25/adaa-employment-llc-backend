import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateVariantsService } from './rate-variants.service';
import { RateVariantsController } from './rate-variants.controller';
import { RateVariant } from './entities/rate-variant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RateVariant])],
  controllers: [RateVariantsController],
  providers: [RateVariantsService],
  exports: [RateVariantsService],
})
export class RateVariantsModule {}



