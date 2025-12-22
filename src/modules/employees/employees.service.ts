import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
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
    try {
      const employee = this.employeeRepository.create(employeeData);
      return await this.employeeRepository.save(employee);
    } catch (error) {
      const userFriendlyError = this.translateDatabaseError(error);
      throw new BadRequestException(userFriendlyError);
    }
  }

  async update(id: number, employeeData: Partial<Employee>): Promise<Employee> {
    try {
      await this.employeeRepository.update(id, employeeData);
      return (await this.findOne(id)) as Employee;
    } catch (error) {
      const userFriendlyError = this.translateDatabaseError(error);
      throw new BadRequestException(userFriendlyError);
    }
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
        Timesheet,
        'timesheet',
        'timesheet.employeeId = employee.id AND timesheet.date = :date',
        { date: targetDate },
      )
      .leftJoinAndSelect('timesheet.project', 'project')
      .leftJoinAndSelect('timesheet.tradeInSite', 'tradeInSite')
      .addSelect([
        'timesheet.id',
        'timesheet.jobStatus',
        'timesheet.hoursWorked',
        'timesheet.notes',
        'timesheet.date',
        'project.id',
        'project.name',
      ])
      .orderBy('employee.name', 'ASC');

    // Filter by job status if provided
    if (status) {
      queryBuilder.andWhere('timesheet.jobStatus = :status', { status });
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
   * Translate database errors to user-friendly messages
   */
  private translateDatabaseError(error: any): string {
    const message = error.message || '';
    const code = error.code || '';

    // Handle duplicate key errors
    if (code === '23505' || message.includes('duplicate key')) {
      if (message.includes('UQ_a8de3ddfd53ca6daf6ba8dd6b93')) {
        return 'Employee with this ADAA Employee Code already exists';
      }
      if (message.includes('adaa_emp_code')) {
        return 'Employee with this ADAA Employee Code already exists';
      }
      if (message.includes('emirates_id')) {
        return 'Employee with this Emirates ID already exists';
      }
      if (message.includes('pp_no') || message.includes('passport')) {
        return 'Employee with this Passport Number already exists';
      }
      return 'This employee record already exists in the system';
    }

    // Handle foreign key constraint errors
    if (code === '23503' || message.includes('foreign key')) {
      return 'Referenced data not found. Please check related information.';
    }

    // Handle null constraint errors
    if (code === '23502' || message.includes('null value')) {
      return 'Required field is missing';
    }

    // Handle check constraint errors
    if (code === '23514' || message.includes('check constraint')) {
      return 'Invalid data format or value';
    }

    // Default to original message if not a known database error
    return message || 'Failed to import employee';
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
        const userFriendlyError = this.translateDatabaseError(error);
        result.errors.push({
          row: rowNumber,
          employee: row['NAME'] || 'Unknown',
          errors: [userFriendlyError],
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
