import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SpecialDay, SpecialDayType } from './entities/special-day.entity';
import { CreateSpecialDayDto } from './dto/create-special-day.dto';
import { UpdateSpecialDayDto } from './dto/update-special-day.dto';
import { SpecialDayFiltersDto } from './dto/special-day-filters.dto';
import { formatDateOnly } from '../../common/utils/date.util';
import { ProjectSpecialDayRate } from '../projects/entities/project-special-day-rate.entity';

export interface SpecialDayRates {
  isSpecialDay: boolean;
  specialDay: SpecialDay | null;
  clientRateMultiplier: number;
  employeeAdditionalAmount: number;
  isDefaultOff: boolean;
  isMandatoryOff: boolean;
  dayType: SpecialDayType | null;
}

@Injectable()
export class SpecialDaysService {
  constructor(
    @InjectRepository(SpecialDay)
    private specialDayRepository: Repository<SpecialDay>,
    @InjectRepository(ProjectSpecialDayRate)
    private projectSpecialDayRateRepository: Repository<ProjectSpecialDayRate>,
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
        'EXTRACT(YEAR FROM specialDay.startDate) = :year OR EXTRACT(YEAR FROM specialDay.endDate) = :year',
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
    const endDate =
      updateDto.endDate !== undefined
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
   * Check if a given date falls within any special day (timezone-neutral).
   *
   * @param date - The date to check
   * @param projectId - Optional project ID. When provided, any special day that
   *                    has been explicitly disabled for this project (via a
   *                    ProjectSpecialDayRate row with isEnabled=false) is
   *                    excluded from the result.
   */
  async isSpecialDay(
    date: Date,
    projectId?: number,
  ): Promise<SpecialDay | null> {
    const dateStr = formatDateOnly(date);

    const qb = this.specialDayRepository
      .createQueryBuilder('specialDay')
      .where('specialDay.isActive = :isActive', { isActive: true })
      .andWhere(
        ':date BETWEEN specialDay.startDate AND COALESCE(specialDay.endDate, specialDay.startDate)',
        { date: dateStr },
      );

    if (projectId) {
      // Exclude any special day explicitly disabled for this project.
      qb.andWhere((subQb) => {
        const sub = subQb
          .subQuery()
          .select('1')
          .from(ProjectSpecialDayRate, 'psdr')
          .where('psdr.projectId = :projectId', { projectId })
          .andWhere('psdr.specialDayId = specialDay.id')
          .andWhere('psdr.isEnabled = :disabledFlag', { disabledFlag: false })
          .getQuery();
        return `NOT EXISTS ${sub}`;
      });
    }

    return await qb.getOne();
  }

  /**
   * Get all special days within a date range (timezone-neutral).
   *
   * @param startDate - Start of the range (inclusive)
   * @param endDate - End of the range (inclusive)
   * @param projectId - Optional project ID. When provided, any special day
   *                    explicitly disabled for this project is excluded.
   */
  async getSpecialDaysInRange(
    startDate: Date,
    endDate: Date,
    projectId?: number,
  ): Promise<SpecialDay[]> {
    const startStr = formatDateOnly(startDate);
    const endStr = formatDateOnly(endDate);

    const qb = this.specialDayRepository
      .createQueryBuilder('specialDay')
      .where('specialDay.isActive = :isActive', { isActive: true })
      .andWhere(
        '(specialDay.startDate BETWEEN :start AND :end OR specialDay.endDate BETWEEN :start AND :end OR (specialDay.startDate <= :start AND specialDay.endDate >= :end))',
        {
          start: startStr,
          end: endStr,
        },
      );

    if (projectId) {
      qb.andWhere((subQb) => {
        const sub = subQb
          .subQuery()
          .select('1')
          .from(ProjectSpecialDayRate, 'psdr')
          .where('psdr.projectId = :projectId', { projectId })
          .andWhere('psdr.specialDayId = specialDay.id')
          .andWhere('psdr.isEnabled = :disabledFlag', { disabledFlag: false })
          .getQuery();
        return `NOT EXISTS ${sub}`;
      });
    }

    return await qb.orderBy('specialDay.startDate', 'ASC').getMany();
  }

  /**
   * Get special day rates and rules for a specific date.
   * This is the main utility method used by other modules (mobilizations,
   * timesheets, billing).
   *
   * @param date - The date to check
   * @param projectId - Optional project ID. When provided:
   *                    1. If the project has an override row with isEnabled=false
   *                       for the matching special day, the special day is
   *                       treated as NOT APPLICABLE (returns a no-special-day result).
   *                    2. Otherwise, the project-specific client rate multiplier
   *                       is used when available; falls back to the global rate.
   *                    Employee rates always come from the global special day.
   */
  async getSpecialDayRates(
    date: Date,
    projectId?: number,
  ): Promise<SpecialDayRates> {
    // When projectId is provided, isSpecialDay already filters out disabled overrides.
    const specialDay = await this.isSpecialDay(date, projectId);

    if (!specialDay) {
      return this.buildNoSpecialDayRates();
    }

    let clientRateMultiplier = Number(specialDay.clientRateMultiplier) || 1.0;
    if (projectId) {
      const projectRate = await this.projectSpecialDayRateRepository.findOne({
        where: {
          projectId,
          specialDayId: specialDay.id,
        },
      });
      // A disabled row was already excluded by isSpecialDay, so any row found
      // here is an enabled override whose multiplier should take precedence.
      if (projectRate) {
        clientRateMultiplier = Number(projectRate.clientRateMultiplier);
      }
    }

    const employeeAdditionalAmount = Number(
      specialDay.employeeAdditionalAmount || 0,
    );

    return {
      isSpecialDay: true,
      specialDay,
      clientRateMultiplier,
      employeeAdditionalAmount,
      isDefaultOff: specialDay.isDefaultOff,
      isMandatoryOff: specialDay.dayType === SpecialDayType.MANDATORY_OFF,
      dayType: specialDay.dayType,
    };
  }

  /**
   * Batch get special day rates for multiple dates (timezone-neutral).
   * More efficient than calling `getSpecialDayRates` per day.
   *
   * @param projectId - Optional project ID. When provided, any special day
   *                    disabled for this project via ProjectSpecialDayRate
   *                    is excluded, and enabled overrides provide the client
   *                    rate multiplier.
   */
  async getSpecialDayRatesForRange(
    startDate: Date,
    endDate: Date,
    projectId?: number,
  ): Promise<Map<string, SpecialDayRates>> {
    const specialDays = await this.getSpecialDaysInRange(
      startDate,
      endDate,
      projectId,
    );

    // Pre-load all enabled project overrides for the matching special days in
    // one query (when projectId is provided).
    const overrideById = new Map<number, number>();
    if (projectId && specialDays.length > 0) {
      const overrides = await this.projectSpecialDayRateRepository.find({
        where: {
          projectId,
          specialDayId: In(specialDays.map((sd) => sd.id)),
          isEnabled: true,
        },
      });
      for (const o of overrides) {
        overrideById.set(o.specialDayId, Number(o.clientRateMultiplier));
      }
    }

    const ratesMap = new Map<string, SpecialDayRates>();
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = formatDateOnly(currentDate);

      const applicableSpecialDay = specialDays.find((sd) => {
        const sdStart = sd.startDate;
        const sdEnd = sd.endDate || sdStart;
        return dateStr >= sdStart && dateStr <= sdEnd;
      });

      if (applicableSpecialDay) {
        const overrideMult = overrideById.get(applicableSpecialDay.id);
        const clientRateMultiplier =
          overrideMult !== undefined
            ? overrideMult
            : Number(applicableSpecialDay.clientRateMultiplier) || 1.0;

        ratesMap.set(dateStr, {
          isSpecialDay: true,
          specialDay: applicableSpecialDay,
          clientRateMultiplier,
          employeeAdditionalAmount: Number(
            applicableSpecialDay.employeeAdditionalAmount || 0,
          ),
          isDefaultOff: applicableSpecialDay.isDefaultOff,
          isMandatoryOff:
            applicableSpecialDay.dayType === SpecialDayType.MANDATORY_OFF,
          dayType: applicableSpecialDay.dayType,
        });
      } else {
        ratesMap.set(dateStr, this.buildNoSpecialDayRates());
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return ratesMap;
  }

  private buildNoSpecialDayRates(): SpecialDayRates {
    return {
      isSpecialDay: false,
      specialDay: null,
      clientRateMultiplier: 1.0,
      employeeAdditionalAmount: 0,
      isDefaultOff: false,
      isMandatoryOff: false,
      dayType: null,
    };
  }
}
