import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { ProjectAllocation } from '../project-allocations/entities/project-allocation.entity';
import { Skill } from '../skills/entities/skill.entity';
import { EmployeeSkill } from '../employee-skills/entities/employee-skill.entity';
import {
  PaginationUtil,
  PaginationOptions,
  PaginatedResponse,
} from '../../common/utils/pagination.util';
import { ExcelValidatorUtil } from './utils/excel-validator.util';
import { ImportResult } from './dto/import-employee.dto';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    @InjectRepository(ProjectAllocation)
    private readonly allocationRepository: Repository<ProjectAllocation>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
    @InjectRepository(EmployeeSkill)
    private readonly employeeSkillRepository: Repository<EmployeeSkill>,
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
    return this.employeeRepository.save(employee);
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

  /**
   * Import employees from Excel file
   * @param fileBuffer Excel file buffer
   * @returns Import result with success/failure counts
   */
  async importEmployees(fileBuffer: Buffer): Promise<ImportResult> {
    // Validate the Excel file structure
    const validation = ExcelValidatorUtil.validateExcelFile(fileBuffer);

    if (!validation.isValid) {
      throw new BadRequestException(validation.errors.join(', '));
    }

    const result: ImportResult = {
      success: 0,
      failed: 0,
      errors: [],
      imported: [],
    };

    // Process each row
    if (!validation.data) {
      throw new BadRequestException('No data found in Excel file');
    }

    for (let i = 0; i < validation.data.length; i++) {
      const row = validation.data[i];
      const rowNumber = i + 2; // +2 because Excel is 1-indexed and has header row

      try {
        // Map Excel row to employee data
        const mappedData = ExcelValidatorUtil.mapRowToEmployee(row);

        // Extract trade and additional data
        const { trade, _additionalData, ...employeeData } = mappedData;

        // Validate required fields
        if (!employeeData.adaa_emp_code || !employeeData.name) {
          result.failed++;
          result.errors.push({
            row: rowNumber,
            employee: employeeData.name || 'Unknown',
            errors: ['ADAA EMP CODE and NAME are required fields'],
          });
          continue;
        }

        // Check if employee already exists
        const existingEmployee = await this.employeeRepository.findOne({
          where: { adaa_emp_code: employeeData.adaa_emp_code },
        });

        let employee: Employee;

        if (existingEmployee) {
          // Update existing employee
          await this.employeeRepository.update(
            existingEmployee.id,
            employeeData,
          );
          const updatedEmployee = await this.employeeRepository.findOne({
            where: { id: existingEmployee.id },
          });
          if (!updatedEmployee) {
            throw new Error('Failed to retrieve updated employee');
          }
          employee = updatedEmployee;
        } else {
          // Create new employee
          employee = await this.create(employeeData);
        }

        // Handle TRADE - link to skill or create new one
        if (trade && employee) {
          await this.handleEmployeeTrade(employee.id, trade);
        }

        result.success++;
        result.imported.push({
          ...employee,
          updated: !!existingEmployee,
        });
      } catch (error) {
        result.failed++;
        result.errors.push({
          row: rowNumber,
          employee: row['NAME'] || 'Unknown',
          errors: [error.message || 'Failed to import employee'],
        });
      }
    }

    return result;
  }

  /**
   * Handle employee trade - find existing skill or create new one and link
   * @param employeeId Employee ID
   * @param tradeName Trade/Skill name
   */
  private async handleEmployeeTrade(
    employeeId: number,
    tradeName: string,
  ): Promise<void> {
    // Find existing skill by name (case-insensitive)
    let skill = await this.skillRepository.findOne({
      where: { skill: ILike(tradeName) },
    });

    // If skill doesn't exist, create it
    if (!skill) {
      const newSkill = this.skillRepository.create({
        skill: tradeName,
        // skillTypeId is optional and will be undefined
      });
      skill = await this.skillRepository.save(newSkill);
    }

    // Check if employee already has this skill
    const existingEmployeeSkill = await this.employeeSkillRepository.findOne({
      where: { employeeId, skillId: skill.id },
    });

    // If not already linked, create the link
    if (!existingEmployeeSkill) {
      const employeeSkill = this.employeeSkillRepository.create({
        employeeId,
        skillId: skill.id,
        rating: 0, // Default rating
        // cost_price is optional and will be undefined
      });
      await this.employeeSkillRepository.save(employeeSkill);
    }
  }

  /**
   * Export all employees to Excel format
   * @returns Excel buffer
   */
  async exportEmployees(): Promise<Buffer> {
    const employees = await this.employeeRepository.find({
      order: { adaa_emp_code: 'ASC' },
    });

    return ExcelValidatorUtil.generateExport(employees);
  }

  /**
   * Generate Excel template for import
   * @returns Excel buffer
   */
  generateImportTemplate(): Buffer {
    return ExcelValidatorUtil.generateTemplate();
  }
}
