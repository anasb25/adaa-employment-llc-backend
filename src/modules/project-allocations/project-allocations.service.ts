import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  ILike,
  In,
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
} from 'typeorm';
import { ProjectAllocation } from './entities/project-allocation.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Project } from '../projects/entities/project.entity';
import {
  Timesheet,
  AttendanceStatus,
} from '../timesheets/entities/timesheet.entity';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { UpdateAllocationDto } from './dto/update-allocation.dto';
import {
  PaginationOptions,
  PaginatedResponse,
  PaginationUtil,
} from '../../common/utils/pagination.util';

@Injectable()
export class ProjectAllocationsService {
  private readonly logger = new Logger(ProjectAllocationsService.name);

  constructor(
    @InjectRepository(ProjectAllocation)
    private readonly allocationRepository: Repository<ProjectAllocation>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
  ) {}

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<ProjectAllocation>> {
    return await PaginationUtil.paginate(this.allocationRepository, options, {
      relations: [
        'employee',
        'employee.employeeSkills',
        'employee.employeeSkills.skill',
        'employee.employeeSkills.skill.skillType',
        'project',
        'project.client',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<ProjectAllocation[]> {
    return await this.allocationRepository.find({
      relations: {
        employee: {
          employeeSkills: {
            skill: true,
          },
        },
        project: {
          client: true,
        },
      },
      order: { createdAt: 'DESC' },
    });
  }

  async search(
    query: string,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<ProjectAllocation>> {
    const searchTerm = `%${query}%`;

    return await PaginationUtil.paginate(this.allocationRepository, options, {
      relations: [
        'employee',
        'employee.employeeSkills',
        'employee.employeeSkills.skill',
        'employee.employeeSkills.skill.skillType',
        'project',
        'project.client',
      ],
      where: [
        { employee: { name: ILike(searchTerm) } },
        { project: { name: ILike(searchTerm) } },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findByProject(projectId: number): Promise<ProjectAllocation[]> {
    return await this.allocationRepository.find({
      where: { projectId },
      relations: [
        'employee',
        'employee.employeeSkills',
        'employee.employeeSkills.skill',
        'employee.employeeSkills.skill.skillType',
        'project',
      ],
      order: { startDate: 'DESC' },
    });
  }

  async findByEmployee(employeeId: number): Promise<ProjectAllocation[]> {
    return await this.allocationRepository.find({
      where: { employeeId },
      relations: ['employee', 'project', 'project.client'],
      order: { startDate: 'DESC' },
    });
  }

  async findOne(id: number): Promise<ProjectAllocation | null> {
    return await this.allocationRepository.findOne({
      where: { id },
      relations: [
        'employee',
        'employee.employeeSkills',
        'employee.employeeSkills.skill',
        'employee.employeeSkills.skill.skillType',
        'project',
        'project.client',
      ],
    });
  }

  async createBulk(
    createDto: CreateAllocationDto,
    createdBy: number,
  ): Promise<ProjectAllocation[]> {
    // Validate project exists
    const project = await this.projectRepository.findOne({
      where: { id: createDto.projectId },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    // Validate all employees exist
    const employees = await this.employeeRepository.find({
      where: { id: In(createDto.employeeIds) },
    });

    if (employees.length !== createDto.employeeIds.length) {
      throw new BadRequestException('One or more employees not found');
    }

    // Convert date strings to Date objects
    const startDate = new Date(createDto.startDate);
    const endDate = createDto.endDate ? new Date(createDto.endDate) : null;

    // Check for existing allocations for these employees in this project during the same period
    const existingAllocations = await this.allocationRepository
      .createQueryBuilder('allocation')
      .where('allocation.projectId = :projectId', {
        projectId: createDto.projectId,
      })
      .andWhere('allocation.employeeId IN (:...employeeIds)', {
        employeeIds: createDto.employeeIds,
      })
      .andWhere(
        endDate
          ? '(allocation.startDate <= :endDate AND (allocation.endDate IS NULL OR allocation.endDate >= :startDate))'
          : '(allocation.endDate IS NULL OR allocation.endDate >= :startDate)',
        { startDate, endDate },
      )
      .getMany();

    if (existingAllocations.length > 0) {
      const duplicateEmployeeNames = existingAllocations
        .map(
          (alloc) => employees.find((emp) => emp.id === alloc.employeeId)?.name,
        )
        .filter(Boolean)
        .join(', ');
      throw new BadRequestException(
        `The following employees are already allocated to this project during the specified period: ${duplicateEmployeeNames}`,
      );
    }

    // Create allocations for all employees
    const allocations = createDto.employeeIds.map((employeeId) => ({
      employeeId,
      projectId: createDto.projectId,
      startDate,
      endDate,
      notes: createDto.notes,
      createdBy,
    }));

    const entities = allocations.map((data) =>
      this.allocationRepository.create(data),
    );

    const saved = await this.allocationRepository.save(entities);

    // Update existing timesheets for these employees on the allocation date range
    // If a timesheet exists for an employee on a date within the allocation period,
    // and the timesheet doesn't have an allocation yet, assign this allocation to it
    try {
      for (const allocation of saved) {
        // Get date range to update
        const allocationStartDate = new Date(allocation.startDate);
        const allocationEndDate = allocation.endDate
          ? new Date(allocation.endDate)
          : new Date('2099-12-31'); // Far future if no end date

        // Find timesheets for this employee in the date range that don't have an allocation
        const timesheetsToUpdate = await this.timesheetRepository
          .createQueryBuilder('timesheet')
          .where('timesheet.employeeId = :employeeId', {
            employeeId: allocation.employeeId,
          })
          .andWhere('timesheet.date >= :startDate', {
            startDate: allocationStartDate,
          })
          .andWhere('timesheet.date <= :endDate', {
            endDate: allocationEndDate,
          })
          .andWhere('timesheet.allocationId IS NULL')
          .getMany();

        // Update these timesheets with the allocation
        for (const timesheet of timesheetsToUpdate) {
          await this.timesheetRepository.update(timesheet.id, {
            allocationId: allocation.id,
            hoursWorked: 10, // Change from idle 8h to active 10h
          });
        }

        if (timesheetsToUpdate.length > 0) {
          this.logger.log(
            `Updated ${timesheetsToUpdate.length} timesheet(s) for employee ${allocation.employeeId} with allocation ${allocation.id}`,
          );
        }
      }
    } catch (error) {
      // Log error but don't fail the allocation creation
      this.logger.error(
        `Failed to update timesheets after allocation: ${error.message}`,
      );
    }

    // Fetch with relations
    return await this.allocationRepository.find({
      where: { id: In(saved.map((a) => a.id)) },
      relations: [
        'employee',
        'employee.employeeSkills',
        'employee.employeeSkills.skill',
        'employee.employeeSkills.skill.skillType',
        'project',
        'project.client',
      ],
    });
  }

  async update(
    id: number,
    updateDto: UpdateAllocationDto,
    updatedBy: number,
  ): Promise<ProjectAllocation> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new BadRequestException('Allocation not found');
    }

    const updateData: any = {
      updatedBy,
    };

    if (updateDto.startDate) {
      updateData.startDate = new Date(updateDto.startDate);
    }
    if (updateDto.endDate !== undefined) {
      updateData.endDate = updateDto.endDate
        ? new Date(updateDto.endDate)
        : null;
    }
    if (updateDto.notes !== undefined) {
      updateData.notes = updateDto.notes;
    }

    await this.allocationRepository.update(id, updateData);
    return (await this.findOne(id)) as ProjectAllocation;
  }

  async remove(id: number): Promise<void> {
    await this.allocationRepository.softDelete(id);
  }

  async removeByEmployeeAndProject(
    employeeId: number,
    projectId: number,
  ): Promise<void> {
    await this.allocationRepository.softDelete({ employeeId, projectId });
  }
}
