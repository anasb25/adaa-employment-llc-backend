import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { SpecialDaysService } from './special-days.service';
import { CreateSpecialDayDto } from './dto/create-special-day.dto';
import { UpdateSpecialDayDto } from './dto/update-special-day.dto';
import { SpecialDayFiltersDto } from './dto/special-day-filters.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import { parseDateOnly } from '../../common/utils/date.util';

@Controller('special-days')
@UseGuards(JwtAuthGuard)
export class SpecialDaysController {
  constructor(private readonly specialDaysService: SpecialDaysService) {}

  @Post()
  create(@Body() createDto: CreateSpecialDayDto, @CurrentUser() user: User) {
    return this.specialDaysService.create(createDto, user.id);
  }

  @Get()
  findAll(@Query() filters: SpecialDayFiltersDto) {
    return this.specialDaysService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.specialDaysService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateSpecialDayDto,
    @CurrentUser() user: User,
  ) {
    return this.specialDaysService.update(id, updateDto, user.id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.specialDaysService.remove(id);
  }

  @Get('check/:date')
  checkDate(@Param('date') date: string) {
    // Parse date as timezone-neutral
    return this.specialDaysService.isSpecialDay(parseDateOnly(date));
  }

  @Get('range/:startDate/:endDate')
  getRange(
    @Param('startDate') startDate: string,
    @Param('endDate') endDate: string,
  ) {
    // Parse dates as timezone-neutral
    return this.specialDaysService.getSpecialDaysInRange(
      parseDateOnly(startDate),
      parseDateOnly(endDate),
    );
  }

  @Get('rates')
  async getRates(@Query('date') date: string) {
    // Parse date as timezone-neutral
    const dateObj = parseDateOnly(date);
    return this.specialDaysService.getSpecialDayRates(dateObj);
  }

  @Get('rates/range')
  async getRatesRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    // Parse dates as timezone-neutral
    const startDateObj = parseDateOnly(startDate);
    const endDateObj = parseDateOnly(endDate);
    const ratesMap = await this.specialDaysService.getSpecialDayRatesForRange(
      startDateObj,
      endDateObj,
    );
    // Convert Map to object for JSON serialization
    return Object.fromEntries(ratesMap);
  }
}

