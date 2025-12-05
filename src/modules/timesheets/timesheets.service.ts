import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  MoreThanOrEqual,
  LessThanOrEqual,
  In,
  IsNull,
} from 'typeorm';
import { Timesheet, AttendanceStatus } from './entities/timesheet.entity';
import { ProjectAllocation } from '../project-allocations/entities/project-allocation.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Skill } from '../skills/entities/skill.entity';
import { Project } from '../projects/entities/project.entity';
import {
  CreateTimesheetDto,
  BulkCreateTimesheetDto,
} from './dto/create-timesheet.dto';
import { UpdateTimesheetDto } from './dto/update-timesheet.dto';
import { TimesheetFiltersDto } from './dto/timesheet-filters.dto';
import {
  PaginationOptions,
  PaginatedResponse,
  PaginationUtil,
} from '../../common/utils/pagination.util';

export interface TimesheetStats {
  totalHours: number;
  totalDays: number;
  activeCount: number;
  onHoldCount: number;
  idleCount: number;
}

@Injectable()
export class TimesheetsService {
  private readonly logger = new Logger(TimesheetsService.name);

  constructor(
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    @InjectRepository(ProjectAllocation)
    private readonly allocationRepository: Repository<ProjectAllocation>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  /**
   * Find all timesheets with optional filters
   */
  async findAll(filters?: TimesheetFiltersDto): Promise<Timesheet[]> {
    const queryBuilder = this.timesheetRepository
      .createQueryBuilder('timesheet')
      .leftJoinAndSelect('timesheet.allocation', 'allocation')
      .leftJoinAndSelect('allocation.employee', 'employee')
      .leftJoinAndSelect('allocation.project', 'project')
      .leftJoinAndSelect('project.client', 'client')
      .leftJoinAndSelect('timesheet.employee', 'directEmployee') // For idle employees
      .leftJoinAndSelect(
        'directEmployee.employeeSkills',
        'directEmployeeSkills',
      )
      .leftJoinAndSelect('directEmployeeSkills.skill', 'directActualTrade')
      .leftJoinAndSelect('employee.employeeSkills', 'employeeSkills')
      .leftJoinAndSelect('employeeSkills.skill', 'actualTrade')
      .leftJoinAndSelect('timesheet.tradeInSite', 'tradeInSite')
      .orderBy('timesheet.date', 'DESC')
      .addOrderBy('timesheet.createdAt', 'DESC');

    this.applyFilters(queryBuilder, filters);

    return await queryBuilder.getMany();
  }

  /**
   * Find all timesheets with pagination
   */
  async findAllPaginated(
    options: PaginationOptions,
    filters?: TimesheetFiltersDto,
  ): Promise<PaginatedResponse<Timesheet>> {
    const queryBuilder = this.timesheetRepository
      .createQueryBuilder('timesheet')
      .leftJoinAndSelect('timesheet.allocation', 'allocation')
      .leftJoinAndSelect('allocation.employee', 'employee')
      .leftJoinAndSelect('allocation.project', 'project')
      .leftJoinAndSelect('project.client', 'client')
      .leftJoinAndSelect('timesheet.employee', 'directEmployee') // For idle employees
      .leftJoinAndSelect(
        'directEmployee.employeeSkills',
        'directEmployeeSkills',
      )
      .leftJoinAndSelect('directEmployeeSkills.skill', 'directActualTrade')
      .leftJoinAndSelect('employee.employeeSkills', 'employeeSkills')
      .leftJoinAndSelect('employeeSkills.skill', 'actualTrade')
      .leftJoinAndSelect('timesheet.tradeInSite', 'tradeInSite')
      .orderBy('timesheet.date', 'DESC')
      .addOrderBy('timesheet.createdAt', 'DESC');

    this.applyFilters(queryBuilder, filters);

    const [data, total] = await queryBuilder
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getManyAndCount();

    return PaginationUtil.createPaginatedResponse(
      data,
      total,
      options.page,
      options.limit,
    );
  }

  /**
   * Apply filters to query builder
   */
  private applyFilters(queryBuilder: any, filters?: TimesheetFiltersDto): void {
    if (!filters) return;

    if (filters.projectId) {
      queryBuilder.andWhere('allocation.projectId = :projectId', {
        projectId: filters.projectId,
      });
    }

    if (filters.employeeId) {
      queryBuilder.andWhere('allocation.employeeId = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    if (filters.status) {
      queryBuilder.andWhere('timesheet.status = :status', {
        status: filters.status,
      });
    }

    if (filters.startDate && filters.endDate) {
      queryBuilder.andWhere('timesheet.date BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    } else if (filters.startDate) {
      queryBuilder.andWhere('timesheet.date >= :startDate', {
        startDate: filters.startDate,
      });
    } else if (filters.endDate) {
      queryBuilder.andWhere('timesheet.date <= :endDate', {
        endDate: filters.endDate,
      });
    }
  }

  /**
   * Find one timesheet by ID
   */
  async findOne(id: number): Promise<Timesheet | null> {
    return await this.timesheetRepository.findOne({
      where: { id },
      relations: {
        allocation: {
          employee: {
            employeeSkills: {
              skill: true,
            },
          },
          project: {
            client: true,
          },
        },
        employee: {
          employeeSkills: {
            skill: true,
          },
        },
        tradeInSite: true,
      },
    });
  }

  /**
   * Find timesheets by allocation ID
   */
  async findByAllocation(allocationId: number): Promise<Timesheet[]> {
    return await this.timesheetRepository.find({
      where: { allocationId },
      relations: {
        allocation: {
          employee: {
            employeeSkills: {
              skill: true,
            },
          },
          project: {
            client: true,
          },
        },
        tradeInSite: true,
      },
      order: { date: 'DESC' },
    });
  }

  /**
   * Find timesheets by date
   */
  async findByDate(date: string): Promise<Timesheet[]> {
    const targetDate = new Date(date);
    return await this.timesheetRepository.find({
      where: { date: targetDate },
      relations: {
        allocation: {
          employee: {
            employeeSkills: {
              skill: true,
            },
          },
          project: {
            client: true,
          },
        },
        employee: {
          employeeSkills: {
            skill: true,
          },
        },
        tradeInSite: true,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get timesheet statistics
   */
  async getStats(filters?: TimesheetFiltersDto): Promise<TimesheetStats> {
    const queryBuilder = this.timesheetRepository
      .createQueryBuilder('timesheet')
      .leftJoin('timesheet.allocation', 'allocation');

    this.applyFilters(queryBuilder, filters);

    const timesheets = await queryBuilder.getMany();

    const uniqueDays = new Set<string>();
    let totalHours = 0;
    let activeCount = 0;
    let onHoldCount = 0;
    let idleCount = 0;

    timesheets.forEach((ts) => {
      totalHours += Number(ts.hoursWorked);
      uniqueDays.add(new Date(ts.date).toISOString().split('T')[0]);

      if (ts.status === AttendanceStatus.ACTIVE) {
        activeCount++;
      } else if (ts.status === AttendanceStatus.ON_HOLD) {
        onHoldCount++;
      } else if (ts.status === AttendanceStatus.IDLE) {
        idleCount++;
      }
    });

    return {
      totalHours,
      totalDays: uniqueDays.size,
      activeCount,
      onHoldCount,
      idleCount,
    };
  }

  /**
   * Create a single timesheet
   */
  async create(
    createDto: CreateTimesheetDto,
    createdBy: number,
  ): Promise<Timesheet> {
    // For idle employees, must provide employeeId
    if (createDto.status === AttendanceStatus.IDLE && !createDto.employeeId) {
      throw new BadRequestException(
        'Employee ID is required for idle status timesheets',
      );
    }

    // For active/on-hold employees, must provide allocationId
    if (createDto.status !== AttendanceStatus.IDLE && !createDto.allocationId) {
      throw new BadRequestException(
        'Allocation ID is required for non-idle timesheets',
      );
    }

    // Validate allocation exists (if provided)
    if (createDto.allocationId) {
      const allocation = await this.allocationRepository.findOne({
        where: { id: createDto.allocationId },
      });

      if (!allocation) {
        throw new BadRequestException('Allocation not found');
      }
    }

    // Validate trade in site if provided
    if (createDto.tradeInSiteId) {
      const skill = await this.skillRepository.findOne({
        where: { id: createDto.tradeInSiteId },
      });

      if (!skill) {
        throw new BadRequestException('Trade skill not found');
      }
    }

    // Validate hours for active status
    if (createDto.status === AttendanceStatus.ACTIVE) {
      if (!createDto.hoursWorked || createDto.hoursWorked < 0) {
        throw new BadRequestException(
          'Hours worked must be provided for active status',
        );
      }
    }

    // Check if timesheet already exists
    const whereClause: any = {
      date: new Date(createDto.date),
    };

    if (createDto.allocationId) {
      whereClause.allocationId = createDto.allocationId;
    } else if (createDto.employeeId) {
      whereClause.employeeId = createDto.employeeId;
    }

    const existing = await this.timesheetRepository.findOne({
      where: whereClause,
    });

    if (existing) {
      throw new BadRequestException(
        'Timesheet already exists for this employee and date',
      );
    }

    const timesheet = this.timesheetRepository.create({
      ...createDto,
      date: new Date(createDto.date),
      createdBy,
    });

    const saved = await this.timesheetRepository.save(timesheet);
    return (await this.findOne(saved.id)) as Timesheet;
  }

  /**
   * Bulk create timesheets
   */
  async bulkCreate(
    bulkDto: BulkCreateTimesheetDto,
    createdBy: number,
  ): Promise<Timesheet[]> {
    const timesheets: Timesheet[] = [];

    // Validate all allocations exist
    const allocationIds = [
      ...new Set(bulkDto.timesheets.map((t) => t.allocationId)),
    ];
    const allocations = await this.allocationRepository.find({
      where: { id: In(allocationIds) },
    });

    if (allocations.length !== allocationIds.length) {
      throw new BadRequestException('One or more allocations not found');
    }

    // Validate all trade skills exist
    const skillIds = [
      ...new Set(
        bulkDto.timesheets
          .map((t) => t.tradeInSiteId)
          .filter((id): id is number => id !== undefined),
      ),
    ];

    if (skillIds.length > 0) {
      const skills = await this.skillRepository.find({
        where: { id: In(skillIds) },
      });

      if (skills.length !== skillIds.length) {
        throw new BadRequestException('One or more trade skills not found');
      }
    }

    // Validate each entry
    for (const dto of bulkDto.timesheets) {
      if (dto.status === AttendanceStatus.ACTIVE) {
        if (!dto.hoursWorked || dto.hoursWorked < 0) {
          throw new BadRequestException(
            'Hours worked must be provided for active entries',
          );
        }
      }
    }

    // Check for duplicates
    const duplicateCheck = bulkDto.timesheets.map((t) => ({
      allocationId: t.allocationId,
      date: new Date(t.date),
    }));

    const existingTimesheets = await this.timesheetRepository.find({
      where: duplicateCheck,
    });

    if (existingTimesheets.length > 0) {
      throw new BadRequestException(
        'One or more timesheets already exist for the specified allocations and dates',
      );
    }

    // Create all timesheets
    for (const dto of bulkDto.timesheets) {
      const timesheet = this.timesheetRepository.create({
        ...dto,
        date: new Date(dto.date),
        createdBy,
      });
      timesheets.push(timesheet);
    }

    const saved = await this.timesheetRepository.save(timesheets);

    // Return with relations
    return await this.timesheetRepository.find({
      where: { id: In(saved.map((t) => t.id)) },
      relations: {
        allocation: {
          employee: {
            employeeSkills: {
              skill: true,
            },
          },
          project: {
            client: true,
          },
        },
        tradeInSite: true,
      },
    });
  }

  /**
   * Update a timesheet
   */
  async update(
    id: number,
    updateDto: UpdateTimesheetDto,
    updatedBy: number,
  ): Promise<Timesheet> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new BadRequestException('Timesheet not found');
    }

    // Validate trade in site if provided
    if (updateDto.tradeInSiteId) {
      const skill = await this.skillRepository.findOne({
        where: { id: updateDto.tradeInSiteId },
      });

      if (!skill) {
        throw new BadRequestException('Trade skill not found');
      }
    }

    // Validate hours for active status
    const newStatus = updateDto.status || existing.status;
    if (newStatus === AttendanceStatus.ACTIVE) {
      const hours = updateDto.hoursWorked ?? existing.hoursWorked;

      if (!hours || hours < 0) {
        throw new BadRequestException(
          'Hours worked must be provided for active status',
        );
      }
    }

    await this.timesheetRepository.update(id, {
      ...updateDto,
      updatedBy,
    });

    return (await this.findOne(id)) as Timesheet;
  }

  /**
   * Delete a timesheet
   */
  async remove(id: number): Promise<void> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new BadRequestException('Timesheet not found');
    }

    await this.timesheetRepository.softDelete(id);
  }

  /**
   * Generate daily timesheets for all employees
   * Creates timesheets for all employees for a given date
   * If employee has an allocation, creates with that allocation
   * Otherwise creates as IDLE
   */
  async generateDailyTimesheets(
    date: string,
    createdBy: number,
  ): Promise<{ created: number; existing: number }> {
    // Get all active employees
    const employees = await this.employeeRepository.find();

    let created = 0;
    let existing = 0;

    const targetDate = new Date(date);

    // Get all active allocations for this date with employee skills
    const allocations = await this.allocationRepository
      .createQueryBuilder('allocation')
      .leftJoinAndSelect('allocation.employee', 'employee')
      .leftJoinAndSelect('employee.employeeSkills', 'employeeSkills')
      .leftJoinAndSelect('employeeSkills.skill', 'skill')
      .where('allocation.startDate <= :date', { date })
      .andWhere('(allocation.endDate IS NULL OR allocation.endDate >= :date)', {
        date,
      })
      .getMany();

    // Create a map of employeeId -> allocation for quick lookup
    const allocationMap = new Map<number, ProjectAllocation>();
    for (const allocation of allocations) {
      // Ensure one employee is not on multiple projects (shouldn't happen, but safety check)
      if (allocationMap.has(allocation.employeeId)) {
        this.logger?.warn?.(
          `Employee ${allocation.employeeId} has multiple allocations for date ${date}. Using first allocation.`,
        );
        continue;
      }
      allocationMap.set(allocation.employeeId, allocation);
    }

    for (const employee of employees) {
      // Check if timesheet already exists for this employee and date
      const existingTimesheet = await this.timesheetRepository.findOne({
        where: {
          employeeId: employee.id,
          date: targetDate,
        },
      });

      if (existingTimesheet) {
        existing++;
        continue;
      }

      // Check if employee has an allocation for this date
      const allocation = allocationMap.get(employee.id);

      let timesheetData: any;

      if (allocation) {
        // Employee is allocated to a project - create with allocation
        // Set default trade in site to employee's first skill
        const defaultSkillId =
          allocation.employee?.employeeSkills?.[0]?.skillId || null;

        timesheetData = {
          employeeId: employee.id,
          allocationId: allocation.id,
          date: targetDate,
          status: AttendanceStatus.ACTIVE,
          hoursWorked: 10, // Default 10 hours for active
          tradeInSiteId: defaultSkillId, // Default to employee's first skill
          notes: null,
          createdBy,
        };
      } else {
        // Employee not allocated - create as IDLE
        timesheetData = {
          employeeId: employee.id,
          allocationId: null,
          date: targetDate,
          status: AttendanceStatus.IDLE,
          hoursWorked: 8, // Default 8 hours for idle
          tradeInSiteId: null,
          notes: null,
          createdBy,
        };
      }

      const timesheet = this.timesheetRepository.create(timesheetData);
      await this.timesheetRepository.save(timesheet);
      created++;
    }

    return { created, existing };
  }

  /**
   * Get dashboard analytics for timesheets
   */
  async getDashboardAnalytics(filters: {
    startDate?: string;
    endDate?: string;
  }) {
    const queryBuilder = this.timesheetRepository
      .createQueryBuilder('timesheet')
      .leftJoinAndSelect('timesheet.allocation', 'allocation')
      .leftJoinAndSelect('allocation.project', 'project')
      .leftJoinAndSelect('allocation.employee', 'employee')
      .leftJoinAndSelect('timesheet.employee', 'directEmployee')
      .leftJoinAndSelect('timesheet.tradeInSite', 'tradeInSite')
      .where('timesheet.deletedAt IS NULL');

    if (filters.startDate) {
      queryBuilder.andWhere('timesheet.date >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('timesheet.date <= :endDate', {
        endDate: filters.endDate,
      });
    }

    const timesheets = await queryBuilder.getMany();

    // Helper to get employee from timesheet
    const getEmployee = (ts: Timesheet) =>
      ts.allocation?.employee || ts.employee;

    // Helper to get project from timesheet
    const getProject = (ts: Timesheet) => ts.allocation?.project;

    // Helper to map status
    const mapStatus = (status: AttendanceStatus): string => {
      switch (status) {
        case AttendanceStatus.ACTIVE:
          return 'ACTIVE';
        case AttendanceStatus.ON_HOLD:
          return 'HOLD';
        case AttendanceStatus.IDLE:
          return 'IDLE';
        default:
          return String(status).toUpperCase();
      }
    };

    // 1. Project Wise
    const projectWise = new Map<
      string,
      { headCount: Set<number>; totalHours: number }
    >();
    timesheets.forEach((ts) => {
      const project = getProject(ts);
      const employee = getEmployee(ts);
      if (project && employee) {
        const key = project.name;
        if (!projectWise.has(key)) {
          projectWise.set(key, { headCount: new Set(), totalHours: 0 });
        }
        const data = projectWise.get(key)!;
        data.headCount.add(employee.id);
        data.totalHours += Number(ts.hoursWorked) || 0;
      }
    });

    // 2. Status Wise
    const statusWise = new Map<
      string,
      { headCount: Set<number>; totalHours: number }
    >();
    timesheets.forEach((ts) => {
      const employee = getEmployee(ts);
      if (employee) {
        const status = mapStatus(ts.status);
        if (!statusWise.has(status)) {
          statusWise.set(status, { headCount: new Set(), totalHours: 0 });
        }
        const data = statusWise.get(status)!;
        data.headCount.add(employee.id);
        data.totalHours += Number(ts.hoursWorked) || 0;
      }
    });

    // 3. FAT Status Wise
    const fatStatusWise = new Map<
      string,
      { headCount: Set<number>; totalHours: number }
    >();
    timesheets.forEach((ts) => {
      const project = getProject(ts);
      const employee = getEmployee(ts);
      if (project?.fat && employee) {
        const key = project.fat;
        if (!fatStatusWise.has(key)) {
          fatStatusWise.set(key, { headCount: new Set(), totalHours: 0 });
        }
        const data = fatStatusWise.get(key)!;
        data.headCount.add(employee.id);
        data.totalHours += Number(ts.hoursWorked) || 0;
      }
    });

    // 4. FAT sub-status Wise
    const fatSubStatusWise = new Map<
      string,
      Map<string, { headCount: Set<number>; totalHours: number }>
    >();
    timesheets.forEach((ts) => {
      const project = getProject(ts);
      const employee = getEmployee(ts);
      if (project?.fat && employee) {
        const fat = project.fat;
        const status = mapStatus(ts.status);
        if (!fatSubStatusWise.has(fat)) {
          fatSubStatusWise.set(fat, new Map());
        }
        const fatMap = fatSubStatusWise.get(fat)!;
        if (!fatMap.has(status)) {
          fatMap.set(status, { headCount: new Set(), totalHours: 0 });
        }
        const data = fatMap.get(status)!;
        data.headCount.add(employee.id);
        data.totalHours += Number(ts.hoursWorked) || 0;
      }
    });

    // 5. Project and Location Wise
    const projectLocationWise = new Map<
      string,
      Map<string, { headCount: Set<number>; totalHours: number }>
    >();
    timesheets.forEach((ts) => {
      const project = getProject(ts);
      const employee = getEmployee(ts);
      if (project && employee) {
        const projectName = project.name;
        const location = project.location || projectName;
        if (!projectLocationWise.has(projectName)) {
          projectLocationWise.set(projectName, new Map());
        }
        const projectMap = projectLocationWise.get(projectName)!;
        if (!projectMap.has(location)) {
          projectMap.set(location, { headCount: new Set(), totalHours: 0 });
        }
        const data = projectMap.get(location)!;
        data.headCount.add(employee.id);
        data.totalHours += Number(ts.hoursWorked) || 0;
      }
    });

    // Calculate grand totals
    const grandTotalHeadCount = new Set<number>();
    let grandTotalHours = 0;
    timesheets.forEach((ts) => {
      const employee = getEmployee(ts);
      if (employee) {
        grandTotalHeadCount.add(employee.id);
        grandTotalHours += Number(ts.hoursWorked) || 0;
      }
    });

    return {
      projectWise: Array.from(projectWise.entries())
        .map(([project, data]) => ({
          project,
          headCount: data.headCount.size,
          totalHours: Number(data.totalHours.toFixed(2)),
        }))
        .sort((a, b) => a.project.localeCompare(b.project)),
      statusWise: Array.from(statusWise.entries())
        .map(([status, data]) => ({
          status,
          headCount: data.headCount.size,
          totalHours: Number(data.totalHours.toFixed(2)),
        }))
        .sort((a, b) => {
          const order = ['ACTIVE', 'HOLD', 'IDLE', 'ABSENT'];
          return (
            (order.indexOf(a.status) === -1 ? 999 : order.indexOf(a.status)) -
            (order.indexOf(b.status) === -1 ? 999 : order.indexOf(b.status))
          );
        }),
      fatStatusWise: Array.from(fatStatusWise.entries())
        .map(([fat, data]) => ({
          fat,
          headCount: data.headCount.size,
          totalHours: Number(data.totalHours.toFixed(2)),
        }))
        .sort((a, b) => a.fat.localeCompare(b.fat)),
      fatSubStatusWise: Array.from(fatSubStatusWise.entries())
        .map(([fat, statusMap]) => ({
          fat,
          subStatuses: Array.from(statusMap.entries())
            .map(([status, data]) => ({
              status,
              headCount: data.headCount.size,
              totalHours: Number(data.totalHours.toFixed(2)),
            }))
            .sort((a, b) => {
              const order = ['ACTIVE', 'HOLD', 'IDLE', 'ABSENT'];
              return (
                (order.indexOf(a.status) === -1
                  ? 999
                  : order.indexOf(a.status)) -
                (order.indexOf(b.status) === -1 ? 999 : order.indexOf(b.status))
              );
            }),
          total: {
            headCount: Array.from(statusMap.values()).reduce(
              (sum, data) => sum + data.headCount.size,
              0,
            ),
            totalHours: Number(
              Array.from(statusMap.values())
                .reduce((sum, data) => sum + data.totalHours, 0)
                .toFixed(2),
            ),
          },
        }))
        .sort((a, b) => a.fat.localeCompare(b.fat)),
      projectLocationWise: Array.from(projectLocationWise.entries())
        .map(([project, locationMap]) => ({
          project,
          locations: Array.from(locationMap.entries())
            .map(([location, data]) => ({
              location,
              count: data.headCount.size,
              totalHours: Number(data.totalHours.toFixed(2)),
            }))
            .sort((a, b) => a.location.localeCompare(b.location)),
          total: {
            count: Array.from(locationMap.values()).reduce(
              (sum, data) => sum + data.headCount.size,
              0,
            ),
            totalHours: Number(
              Array.from(locationMap.values())
                .reduce((sum, data) => sum + data.totalHours, 0)
                .toFixed(2),
            ),
          },
        }))
        .sort((a, b) => a.project.localeCompare(b.project)),
      locationTradeWise: (() => {
        const locationTradeMap = new Map<
          string,
          Map<string, { headCount: Set<number>; totalHours: number }>
        >();
        timesheets.forEach((ts) => {
          const project = getProject(ts);
          const employee = getEmployee(ts);
          const trade = ts.tradeInSite;
          if (project && employee && trade) {
            const location = project.location || project.name;
            if (!locationTradeMap.has(location)) {
              locationTradeMap.set(location, new Map());
            }
            const locationMap = locationTradeMap.get(location)!;
            const tradeName = trade.skill || 'Unassigned';
            if (!locationMap.has(tradeName)) {
              locationMap.set(tradeName, {
                headCount: new Set(),
                totalHours: 0,
              });
            }
            const data = locationMap.get(tradeName)!;
            data.headCount.add(employee.id);
            data.totalHours += Number(ts.hoursWorked) || 0;
          }
        });

        return Array.from(locationTradeMap.entries())
          .map(([location, tradeMap]) => ({
            location,
            trades: Array.from(tradeMap.entries())
              .map(([trade, data]) => ({
                trade,
                count: data.headCount.size,
                totalHours: Number(data.totalHours.toFixed(2)),
              }))
              .sort((a, b) => a.trade.localeCompare(b.trade)),
            total: {
              count: Array.from(tradeMap.values()).reduce(
                (sum, data) => sum + data.headCount.size,
                0,
              ),
              totalHours: Number(
                Array.from(tradeMap.values())
                  .reduce((sum, data) => sum + data.totalHours, 0)
                  .toFixed(2),
              ),
            },
          }))
          .sort((a, b) => a.location.localeCompare(b.location));
      })(),
      grandTotal: {
        headCount: grandTotalHeadCount.size,
        totalHours: Number(grandTotalHours.toFixed(2)),
      },
    };
  }
}
