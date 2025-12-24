import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpecialDaysService } from './special-days.service';
import { SpecialDaysController } from './special-days.controller';
import { SpecialDay } from './entities/special-day.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SpecialDay])],
  controllers: [SpecialDaysController],
  providers: [SpecialDaysService],
  exports: [SpecialDaysService],
})
export class SpecialDaysModule {}

