import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { ProjectAllocation } from '../project-allocations/entities/project-allocation.entity';
import {
  PaginationUtil,
  PaginationOptions,
  PaginatedResponse,
} from '../../common/utils/pagination.util';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    @InjectRepository(ProjectAllocation)
    private readonly allocationRepository: Repository<ProjectAllocation>,
  ) {}

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Employee>> {
    return await PaginationUtil.paginate(this.employeeRepository, options, {
      relations: [
        'employeeSkills',
        'employeeSkills.skill',
        'employeeSkills.skill.skillType',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async searchEmployees(
    query: string,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Employee>> {
    const searchTerm = `%${query}%`;

    return await PaginationUtil.paginate(this.employeeRepository, options, {
      relations: [
        'employeeSkills',
        'employeeSkills.skill',
        'employeeSkills.skill.skillType',
      ],
      where: [
        { name: ILike(searchTerm) },
        { adaa_emp_code: ILike(searchTerm) },
        { pp_no: ILike(searchTerm) },
        { emirates_id: ILike(searchTerm) },
        { contact_no: ILike(searchTerm) },
        { personal_code: ILike(searchTerm) },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Employee | null> {
    return await this.employeeRepository.findOne({
      where: { id },
      relations: [
        'employeeSkills',
        'employeeSkills.skill',
        'employeeSkills.skill.skillType',
      ],
    });
  }

  async create(employeeData: Partial<Employee>): Promise<Employee> {
    const employee = this.employeeRepository.create(employeeData);
    return await this.employeeRepository.save(employee);
  }

  async update(id: number, employeeData: Partial<Employee>): Promise<Employee> {
    await this.employeeRepository.update(id, employeeData);
    return (await this.findOne(id)) as Employee;
  }

  async remove(id: number): Promise<void> {
    await this.employeeRepository.softDelete(id);
  }

  async getEmployeesWithTimesheetStatus(
    date: string,
    status?: string,
    options?: PaginationOptions,
  ): Promise<any> {
    const targetDate = new Date(date);

    // Get all employees with their skills
    const queryBuilder = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.employeeSkills', 'employeeSkills')
      .leftJoinAndSelect('employeeSkills.skill', 'skill')
      .leftJoinAndSelect('skill.skillType', 'skillType')
      .leftJoin(
        ProjectAllocation,
        'allocation',
        'allocation.employeeId = employee.id',
      )
      .leftJoin(
        Timesheet,
        'timesheet',
        'timesheet.allocationId = allocation.id AND timesheet.date = :date',
        { date: targetDate },
      )
      .leftJoinAndSelect('timesheet.tradeInSite', 'tradeInSite')
      .leftJoinAndSelect('allocation.project', 'project')
      .addSelect([
        'timesheet.id',
        'timesheet.status',
        'timesheet.hoursWorked',
        'timesheet.notes',
        'timesheet.date',
        'allocation.id',
        'project.id',
        'project.name',
      ])
      .orderBy('employee.name', 'ASC');

    // Filter by status if provided
    if (status) {
      queryBuilder.andWhere('timesheet.status = :status', { status });
    }

    // Apply pagination if provided
    if (options) {
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

    // Return all without pagination
    const employees = await queryBuilder.getMany();
    return {
      data: employees,
      total: employees.length,
      page: 1,
      limit: employees.length,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
  }
}
