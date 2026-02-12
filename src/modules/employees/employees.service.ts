import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { Skill } from '../skills/entities/skill.entity';
import { EmployeeSkill } from '../employee-skills/entities/employee-skill.entity';
import { Mobilization } from '../mobilizations/entities/mobilization.entity';
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
    @InjectRepository(Mobilization)
    private readonly mobilizationRepository: Repository<Mobilization>,
  ) {}

  /**
   * Get the latest mobilization status for a list of employee IDs.
   * Returns a map of employeeId -> { jobStatus, mobStatus, projectName }
   */
  private async getLatestMobilizationStatuses(
    employeeIds: number[],
  ): Promise<
    Map<
      number,
      { jobStatus: string; mobStatus: string; projectName: string | null }
    >
  > {
    const statusMap = new Map<
      number,
      { jobStatus: string; mobStatus: string; projectName: string | null }
    >();

    if (employeeIds.length === 0) return statusMap;

    // For each employee, get their latest mobilization record (by actionDate DESC, id DESC)
    const latestMobilizations = await this.mobilizationRepository
      .createQueryBuilder('mob')
      .leftJoinAndSelect('mob.project', 'project')
      .where((qb) => {
        const subQuery = qb
          .subQuery()
          .select('m2.id')
          .from(Mobilization, 'm2')
          .where('m2.employeeId = mob.employeeId')
          .andWhere('m2.deletedAt IS NULL')
          .orderBy('m2.actionDate', 'DESC')
          .addOrderBy('m2.id', 'DESC')
          .limit(1)
          .getQuery();
        return `mob.id = ${subQuery}`;
      })
      .andWhere('mob.employeeId IN (:...employeeIds)', { employeeIds })
      .andWhere('mob.deletedAt IS NULL')
      .getMany();

    for (const mob of latestMobilizations) {
      statusMap.set(mob.employeeId, {
        jobStatus: mob.jobStatus,
        mobStatus: mob.mobStatus,
        projectName: mob.project?.name || null,
      });
    }

    return statusMap;
  }

  /**
   * Enrich employee objects with their latest mobilization status.
   * Adds latestMobilization field to each employee.
   */
  private async enrichWithMobilizationStatus(
    employees: Employee[],
  ): Promise<any[]> {
    if (employees.length === 0) return employees;

    const employeeIds = employees.map((e) => e.id);
    const statusMap = await this.getLatestMobilizationStatuses(employeeIds);

    return employees.map((employee) => {
      const mobStatus = statusMap.get(employee.id);
      return {
        ...employee,
        latestMobilization: mobStatus || null,
      };
    });
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<any>> {
    const result = await PaginationUtil.paginate(
      this.employeeRepository,
      options,
      {
        relations: [
          'employeeSkills',
          'employeeSkills.skill',
          'employeeSkills.skill.skillType',
        ],
        order: { createdAt: 'DESC' },
      },
    );

    const enrichedData = await this.enrichWithMobilizationStatus(result.data);
    return { ...result, data: enrichedData };
  }

  async searchEmployees(
    query: string,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<any>> {
    const searchTerm = `%${query}%`;

    const result = await PaginationUtil.paginate(
      this.employeeRepository,
      options,
      {
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
      },
    );

    const enrichedData = await this.enrichWithMobilizationStatus(result.data);
    return { ...result, data: enrichedData };
  }

  async findOne(id: number): Promise<any | null> {
    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: [
        'employeeSkills',
        'employeeSkills.skill',
        'employeeSkills.skill.skillType',
      ],
    });

    if (!employee) return null;

    const enriched = await this.enrichWithMobilizationStatus([employee]);
    return enriched[0];
  }

  /**
   * Calculate air tickets based on years of service from date of joining
   */
  private calculateAirTickets(dateOfJoining: string | null): number {
    if (!dateOfJoining) return 0;
    const joinDate = new Date(dateOfJoining);
    const today = new Date();
    const yearsOfService =
      (today.getTime() - joinDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return Math.floor(yearsOfService);
  }

  /**
   * Calculate annual leave balance based on years of service from date of joining
   * Each year adds 30 days
   */
  private calculateAnnualLeaveBalance(dateOfJoining: string | null): number {
    if (!dateOfJoining) return 0;
    const joinDate = new Date(dateOfJoining);
    const today = new Date();
    const yearsOfService =
      (today.getTime() - joinDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return Math.floor(yearsOfService) * 30;
  }

  async create(employeeData: Partial<Employee>): Promise<Employee> {
    try {
      // Auto-calculate air_tickets and annual_leave_balance if date_of_joining is provided
      // But allow manual override if provided in employeeData
      if (employeeData.date_of_joining) {
        if (employeeData.air_tickets === undefined) {
          employeeData.air_tickets = this.calculateAirTickets(
            employeeData.date_of_joining,
          );
        }
        if (employeeData.annual_leave_balance === undefined) {
          employeeData.annual_leave_balance = this.calculateAnnualLeaveBalance(
            employeeData.date_of_joining,
          );
        }
      }
      const employee = this.employeeRepository.create(employeeData);
      return await this.employeeRepository.save(employee);
    } catch (error) {
      const userFriendlyError = this.translateDatabaseError(error);
      throw new BadRequestException(userFriendlyError);
    }
  }

  async update(id: number, employeeData: Partial<Employee>): Promise<Employee> {
    try {
      // If date_of_joining is being updated, recalculate air_tickets and annual_leave_balance
      // But only if they're not explicitly provided (allow manual override)
      if (employeeData.date_of_joining) {
        if (employeeData.air_tickets === undefined) {
          employeeData.air_tickets = this.calculateAirTickets(
            employeeData.date_of_joining,
          );
        }
        if (employeeData.annual_leave_balance === undefined) {
          employeeData.annual_leave_balance = this.calculateAnnualLeaveBalance(
            employeeData.date_of_joining,
          );
        }
      }
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

  async decrementAirTicket(id: number): Promise<Employee> {
    const employee = await this.findOne(id);
    if (!employee) {
      throw new BadRequestException(`Employee with ID ${id} not found`);
    }
    const newCount = Math.max(0, (employee.air_tickets || 0) - 1);
    await this.employeeRepository.update(id, { air_tickets: newCount });
    return (await this.findOne(id)) as Employee;
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
    const detail = error.detail || '';

    // Handle duplicate key errors
    if (code === '23505' || message.includes('duplicate key')) {
      // Extract the duplicated value from the error detail if available
      let duplicateValue = '';
      const valueMatch = detail.match(/Key \(.*?\)=\((.*?)\)/);
      if (valueMatch && valueMatch[1]) {
        duplicateValue = ` (${valueMatch[1]})`;
      }

      // Check which field is causing the duplicate
      if (
        message.includes('UQ_a8de3ddfd53ca6daf6ba8dd6b93') ||
        message.includes('adaa_emp_code')
      ) {
        return `Duplicate ADAA Employee Code${duplicateValue}. This code already exists in the system.`;
      }
      if (message.includes('emirates_id')) {
        return `Duplicate Emirates ID${duplicateValue}. This Emirates ID already exists in the system.`;
      }
      if (message.includes('pp_no')) {
        return `Duplicate Passport Number${duplicateValue}. This passport number already exists in the system.`;
      }
      if (message.includes('work_permit_no')) {
        return `Duplicate Work Permit Number${duplicateValue}. This work permit number already exists in the system.`;
      }
      if (message.includes('personal_code')) {
        return `Duplicate Personal Code${duplicateValue}. This personal code already exists in the system.`;
      }

      // If we can't determine the specific field, try to extract it from the constraint name
      const constraintMatch = message.match(/constraint "([^"]+)"/);
      if (constraintMatch) {
        const constraint = constraintMatch[1];
        if (constraint.includes('adaa_emp_code')) {
          return `Duplicate ADAA Employee Code${duplicateValue}. This code already exists.`;
        }
        if (constraint.includes('emirates_id')) {
          return `Duplicate Emirates ID${duplicateValue}. This Emirates ID already exists.`;
        }
        if (constraint.includes('pp_no')) {
          return `Duplicate Passport Number${duplicateValue}. This passport number already exists.`;
        }
        if (constraint.includes('work_permit_no')) {
          return `Duplicate Work Permit Number${duplicateValue}. This work permit number already exists.`;
        }
        if (constraint.includes('personal_code')) {
          return `Duplicate Personal Code${duplicateValue}. This personal code already exists.`;
        }
      }

      return `Duplicate entry found${duplicateValue}. Please check for duplicate ADAA Code, Passport Number, Emirates ID, Work Permit Number, or Personal Code.`;
    }

    // Handle foreign key constraint errors
    if (code === '23503' || message.includes('foreign key')) {
      return 'Referenced data not found. Please check related information.';
    }

    // Handle null constraint errors
    if (code === '23502' || message.includes('null value')) {
      const columnMatch = message.match(/column "([^"]+)"/);
      const columnName = columnMatch ? columnMatch[1] : 'unknown field';
      return `Required field is missing: ${columnName}`;
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

    // First pass: Check for duplicates within the Excel file itself
    const uniqueFields = {
      adaa_emp_code: new Map<string, number>(),
      pp_no: new Map<string, number>(),
      emirates_id: new Map<string, number>(),
      work_permit_no: new Map<string, number>(),
      personal_code: new Map<string, number>(),
    };

    for (let i = 0; i < validation.data.length; i++) {
      const row = validation.data[i];
      const rowNumber = i + 2;
      const mappedData = ExcelValidatorUtil.mapRowToEmployee(row);

      // Check each unique field for duplicates within the file
      if (mappedData.adaa_emp_code) {
        if (uniqueFields.adaa_emp_code.has(mappedData.adaa_emp_code)) {
          result.failed++;
          result.errors.push({
            row: rowNumber,
            employee: mappedData.name || 'Unknown',
            errors: [
              `Duplicate ADAA Employee Code (${mappedData.adaa_emp_code}) found in Excel file at rows ${uniqueFields.adaa_emp_code.get(mappedData.adaa_emp_code)} and ${rowNumber}`,
            ],
          });
          continue;
        }
        uniqueFields.adaa_emp_code.set(mappedData.adaa_emp_code, rowNumber);
      }

      if (mappedData.pp_no) {
        if (uniqueFields.pp_no.has(mappedData.pp_no)) {
          result.failed++;
          result.errors.push({
            row: rowNumber,
            employee: mappedData.name || 'Unknown',
            errors: [
              `Duplicate Passport Number (${mappedData.pp_no}) found in Excel file at rows ${uniqueFields.pp_no.get(mappedData.pp_no)} and ${rowNumber}`,
            ],
          });
          continue;
        }
        uniqueFields.pp_no.set(mappedData.pp_no, rowNumber);
      }

      if (mappedData.emirates_id) {
        if (uniqueFields.emirates_id.has(mappedData.emirates_id)) {
          result.failed++;
          result.errors.push({
            row: rowNumber,
            employee: mappedData.name || 'Unknown',
            errors: [
              `Duplicate Emirates ID (${mappedData.emirates_id}) found in Excel file at rows ${uniqueFields.emirates_id.get(mappedData.emirates_id)} and ${rowNumber}`,
            ],
          });
          continue;
        }
        uniqueFields.emirates_id.set(mappedData.emirates_id, rowNumber);
      }

      if (mappedData.work_permit_no) {
        if (uniqueFields.work_permit_no.has(mappedData.work_permit_no)) {
          result.failed++;
          result.errors.push({
            row: rowNumber,
            employee: mappedData.name || 'Unknown',
            errors: [
              `Duplicate Work Permit Number (${mappedData.work_permit_no}) found in Excel file at rows ${uniqueFields.work_permit_no.get(mappedData.work_permit_no)} and ${rowNumber}`,
            ],
          });
          continue;
        }
        uniqueFields.work_permit_no.set(mappedData.work_permit_no, rowNumber);
      }

      if (mappedData.personal_code) {
        if (uniqueFields.personal_code.has(mappedData.personal_code)) {
          result.failed++;
          result.errors.push({
            row: rowNumber,
            employee: mappedData.name || 'Unknown',
            errors: [
              `Duplicate Personal Code (${mappedData.personal_code}) found in Excel file at rows ${uniqueFields.personal_code.get(mappedData.personal_code)} and ${rowNumber}`,
            ],
          });
          continue;
        }
        uniqueFields.personal_code.set(mappedData.personal_code, rowNumber);
      }
    }

    // Second pass: Import the valid rows
    for (let i = 0; i < validation.data.length; i++) {
      const row = validation.data[i];
      const rowNumber = i + 2; // +2 because Excel is 1-indexed and has header row

      // Skip rows that already failed validation in first pass
      if (result.errors.some((err) => err.row === rowNumber)) {
        continue;
      }

      try {
        // Map Excel row to employee data
        const mappedData = ExcelValidatorUtil.mapRowToEmployee(row);

        // Extract trade, rate_per_hr, and prepare employee data
        const { trade, rate_per_hr, ...employeeData } = mappedData;

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

        // Handle TRADE - link to skill or create new one, with rate_per_hr
        if (trade && employee) {
          await this.handleEmployeeTrade(employee.id, trade, rate_per_hr);
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
   * @param costPrice Cost price/hourly rate from Excel
   */
  private async handleEmployeeTrade(
    employeeId: number,
    tradeName: string,
    costPrice?: number | null,
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
        cost_price: costPrice || null, // Use provided cost price from Excel
      });
      await this.employeeSkillRepository.save(employeeSkill);
    } else if (costPrice !== null && costPrice !== undefined) {
      // Update existing employee skill with new cost price if provided
      existingEmployeeSkill.cost_price = costPrice;
      await this.employeeSkillRepository.save(existingEmployeeSkill);
    }
  }

  /**
   * Export all employees to Excel format
   * @returns Excel buffer
   */
  async exportEmployees(): Promise<Buffer> {
    const employees = await this.employeeRepository.find({
      relations: ['employeeSkills', 'employeeSkills.skill'],
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
