import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { RateVariantsService } from './rate-variants.service';
import { CreateRateVariantDto } from './dto/create-rate-variant.dto';
import { UpdateRateVariantDto } from './dto/update-rate-variant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { User } from '../users/entities/user.entity';

@Controller('rate-variants')
@UseGuards(JwtAuthGuard)
export class RateVariantsController {
  constructor(private readonly rateVariantsService: RateVariantsService) {}

  @Post()
  create(@Body() createDto: CreateRateVariantDto, @CurrentUser() user: User) {
    return this.rateVariantsService.create(createDto, user.id);
  }

  @Get()
  findAll() {
    return this.rateVariantsService.findAll();
  }

  @Get('base')
  findBaseRate() {
    return this.rateVariantsService.findBaseRate();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rateVariantsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateRateVariantDto,
    @CurrentUser() user: User,
  ) {
    return this.rateVariantsService.update(id, updateDto, user.id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rateVariantsService.remove(id);
  }
}


