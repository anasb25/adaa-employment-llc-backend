import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { SpecialDay } from './entities/special-day.entity';
import { CreateSpecialDayDto } from './dto/create-special-day.dto';
import { UpdateSpecialDayDto } from './dto/update-special-day.dto';
import { SpecialDayFiltersDto } from './dto/special-day-filters.dto';

@Injectable()
export class SpecialDaysService {
  constructor(
    @InjectRepository(SpecialDay)
    private specialDayRepository: Repository<SpecialDay>,
  ) {}

  async create(
    createDto: CreateSpecialDayDto,
    createdBy: number,
  ): Promise<SpecialDay> {
    // Validate date range
    if (createDto.endDate && createDto.startDate > createDto.endDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const specialDay = this.specialDayRepository.create({
      ...createDto,
      createdBy,
    });

    return await this.specialDayRepository.save(specialDay);
  }

  async findAll(filters?: SpecialDayFiltersDto): Promise<SpecialDay[]> {
    const queryBuilder =
      this.specialDayRepository.createQueryBuilder('specialDay');

    // Filter by category
    if (filters?.category) {
      queryBuilder.andWhere('specialDay.category = :category', {
        category: filters.category,
      });
    }

    // Filter by date range
    if (filters?.startDate && filters?.endDate) {
      queryBuilder.andWhere(
        '(specialDay.startDate BETWEEN :start AND :end OR specialDay.endDate BETWEEN :start AND :end OR (specialDay.startDate <= :start AND specialDay.endDate >= :end))',
        {
          start: filters.startDate,
          end: filters.endDate,
        },
      );
    } else if (filters?.startDate) {
      queryBuilder.andWhere('specialDay.endDate >= :start', {
        start: filters.startDate,
      });
    } else if (filters?.endDate) {
      queryBuilder.andWhere('specialDay.startDate <= :end', {
        end: filters.endDate,
      });
    }

    // Filter by year
    if (filters?.year) {
      queryBuilder.andWhere(
        "EXTRACT(YEAR FROM specialDay.startDate) = :year OR EXTRACT(YEAR FROM specialDay.endDate) = :year",
        { year: filters.year },
      );
    }

    queryBuilder.orderBy('specialDay.startDate', 'ASC');

    return await queryBuilder.getMany();
  }

  async findOne(id: number): Promise<SpecialDay> {
    const specialDay = await this.specialDayRepository.findOne({
      where: { id },
    });

    if (!specialDay) {
      throw new NotFoundException('Special day not found');
    }

    return specialDay;
  }

  async update(
    id: number,
    updateDto: UpdateSpecialDayDto,
    updatedBy: number,
  ): Promise<SpecialDay> {
    const specialDay = await this.findOne(id);

    // Validate date range
    const startDate = updateDto.startDate || specialDay.startDate;
    const endDate = updateDto.endDate || specialDay.endDate;
    if (endDate && startDate > endDate) {
      throw new BadRequestException('End date must be after start date');
    }

    Object.assign(specialDay, updateDto);
    specialDay.updatedBy = updatedBy;

    return await this.specialDayRepository.save(specialDay);
  }

  async remove(id: number): Promise<void> {
    const specialDay = await this.findOne(id);
    await this.specialDayRepository.remove(specialDay);
  }

  /**
   * Check if a given date falls within any special day
   */
  async isSpecialDay(date: Date): Promise<SpecialDay | null> {
    const dateStr = date.toISOString().split('T')[0];

    const specialDay = await this.specialDayRepository
      .createQueryBuilder('specialDay')
      .where('specialDay.isActive = :isActive', { isActive: true })
      .andWhere('specialDay.startDate <= :date', { date: dateStr })
      .andWhere(
        '(specialDay.endDate IS NULL OR specialDay.endDate >= :date)',
        { date: dateStr },
      )
      .getOne();

    return specialDay;
  }

  /**
   * Get all special days within a date range
   */
  async getSpecialDaysInRange(
    startDate: Date,
    endDate: Date,
  ): Promise<SpecialDay[]> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    return await this.specialDayRepository
      .createQueryBuilder('specialDay')
      .where('specialDay.isActive = :isActive', { isActive: true })
      .andWhere(
        '(specialDay.startDate BETWEEN :start AND :end OR specialDay.endDate BETWEEN :start AND :end OR (specialDay.startDate <= :start AND specialDay.endDate >= :end))',
        {
          start: startStr,
          end: endStr,
        },
      )
      .orderBy('specialDay.startDate', 'ASC')
      .getMany();
  }
}

