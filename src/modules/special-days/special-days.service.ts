import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { SpecialDay, SpecialDayType } from './entities/special-day.entity';
import { CreateSpecialDayDto } from './dto/create-special-day.dto';
import { UpdateSpecialDayDto } from './dto/update-special-day.dto';
import { SpecialDayFiltersDto } from './dto/special-day-filters.dto';

export interface SpecialDayRates {
  isSpecialDay: boolean;
  specialDay: SpecialDay | null;
  clientRateMultiplier: number;
  employeeRateMultiplier: number;
  isDefaultOff: boolean;
  isMandatoryOff: boolean;
  dayType: SpecialDayType | null;
}

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

    // If no end date provided, set it to start date (single day event)
    const endDate = createDto.endDate || createDto.startDate;

    const specialDay = this.specialDayRepository.create({
      ...createDto,
      endDate,
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
    const endDate = updateDto.endDate !== undefined 
      ? updateDto.endDate || startDate // If explicitly set to empty, use startDate
      : specialDay.endDate; // If not provided, keep existing
      
    if (endDate && startDate > endDate) {
      throw new BadRequestException('End date must be after start date');
    }

    Object.assign(specialDay, { ...updateDto, endDate });
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
      .andWhere(':date BETWEEN specialDay.startDate AND COALESCE(specialDay.endDate, specialDay.startDate)', {
        date: dateStr,
      })
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

  /**
   * Get special day rates and rules for a specific date
   * This is the main utility method to be used by other modules (mobilizations, timesheets, billing)
   */
  async getSpecialDayRates(date: Date): Promise<SpecialDayRates> {
    const specialDay = await this.isSpecialDay(date);

    if (!specialDay) {
      return {
        isSpecialDay: false,
        specialDay: null,
        clientRateMultiplier: 1.0,
        employeeRateMultiplier: 1.0,
        isDefaultOff: false,
        isMandatoryOff: false,
        dayType: null,
      };
    }

    return {
      isSpecialDay: true,
      specialDay,
      clientRateMultiplier: Number(specialDay.clientRateMultiplier),
      employeeRateMultiplier: Number(specialDay.employeeRateMultiplier),
      isDefaultOff: specialDay.isDefaultOff,
      isMandatoryOff: specialDay.dayType === SpecialDayType.MANDATORY_OFF,
      dayType: specialDay.dayType,
    };
  }

  /**
   * Batch get special day rates for multiple dates
   * More efficient than calling getSpecialDayRates multiple times
   */
  async getSpecialDayRatesForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<Map<string, SpecialDayRates>> {
    const specialDays = await this.getSpecialDaysInRange(startDate, endDate);
    const ratesMap = new Map<string, SpecialDayRates>();

    // Create a map of all dates in range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];

      // Find if this date falls within any special day
      const applicableSpecialDay = specialDays.find((sd) => {
        const sdStart = new Date(sd.startDate);
        const sdEnd = sd.endDate ? new Date(sd.endDate) : sdStart;
        return currentDate >= sdStart && currentDate <= sdEnd;
      });

      if (applicableSpecialDay) {
        ratesMap.set(dateStr, {
          isSpecialDay: true,
          specialDay: applicableSpecialDay,
          clientRateMultiplier: Number(applicableSpecialDay.clientRateMultiplier),
          employeeRateMultiplier: Number(applicableSpecialDay.employeeRateMultiplier),
          isDefaultOff: applicableSpecialDay.isDefaultOff,
          isMandatoryOff:
            applicableSpecialDay.dayType === SpecialDayType.MANDATORY_OFF,
          dayType: applicableSpecialDay.dayType,
        });
      } else {
        ratesMap.set(dateStr, {
          isSpecialDay: false,
          specialDay: null,
          clientRateMultiplier: 1.0,
          employeeRateMultiplier: 1.0,
          isDefaultOff: false,
          isMandatoryOff: false,
          dayType: null,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return ratesMap;
  }
}

