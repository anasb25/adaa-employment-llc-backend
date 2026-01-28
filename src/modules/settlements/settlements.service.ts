import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Settlement, SettlementStatus } from './entities/settlement.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeSkill } from '../employee-skills/entities/employee-skill.entity';
import { Skill } from '../skills/entities/skill.entity';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { UpdateSettlementDto } from './dto/update-settlement.dto';
import {
  PaginationUtil,
  PaginationOptions,
  PaginatedResponse,
} from '../../common/utils/pagination.util';

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Settlement)
    private readonly settlementRepository: Repository<Settlement>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeSkill)
    private readonly employeeSkillRepository: Repository<EmployeeSkill>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
  ) {}

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Settlement>> {
    return await PaginationUtil.paginate(this.settlementRepository, options, {
      relations: ['employee'],
      order: { createdAt: 'DESC' },
    });
  }

  async searchSettlements(
    query: string,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Settlement>> {
    const searchTerm = `%${query}%`;

    return await PaginationUtil.paginate(this.settlementRepository, options, {
      relations: ['employee'],
      where: [
        { empName: ILike(searchTerm) },
        { empCode: ILike(searchTerm) },
        { passportNo: ILike(searchTerm) },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Settlement> {
    const settlement = await this.settlementRepository.findOne({
      where: { id },
      relations: ['employee'],
    });

    if (!settlement) {
      throw new NotFoundException(`Settlement with ID ${id} not found`);
    }

    return settlement;
  }

  async findByEmployee(
    employeeId: number,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Settlement>> {
    return await PaginationUtil.paginate(this.settlementRepository, options, {
      where: { employeeId },
      relations: ['employee'],
      order: { createdAt: 'DESC' },
    });
  }

  async create(
    createSettlementDto: CreateSettlementDto,
    userId: number,
  ): Promise<Settlement> {
    // Verify employee exists
    const employee = await this.employeeRepository.findOne({
      where: { id: createSettlementDto.employeeId },
    });

    if (!employee) {
      throw new NotFoundException(
        `Employee with ID ${createSettlementDto.employeeId} not found`,
      );
    }

    // Calculate totals
    const totalDue = createSettlementDto.paymentItems.reduce(
      (sum, item) => sum + Number(item.amount),
      0,
    );

    const totalDeduction = createSettlementDto.deductionItems.reduce(
      (sum, item) => sum + Number(item.amount),
      0,
    );

    const finalAmount = totalDue - totalDeduction;

    const settlement = this.settlementRepository.create({
      ...createSettlementDto,
      totalDue,
      totalDeduction,
      finalAmount,
      preparedBy: userId,
      createdBy: userId,
    });

    return await this.settlementRepository.save(settlement);
  }

  async update(
    id: number,
    updateSettlementDto: UpdateSettlementDto,
    userId: number,
  ): Promise<Settlement> {
    const settlement = await this.findOne(id);

    // Prevent updating if already paid
    if (settlement.status === SettlementStatus.PAID) {
      throw new BadRequestException(
        'Cannot update a settlement that has already been paid',
      );
    }

    // Recalculate totals if payment or deduction items changed
    let updateData: any = { ...updateSettlementDto };

    if (
      updateSettlementDto.paymentItems ||
      updateSettlementDto.deductionItems
    ) {
      const paymentItems =
        updateSettlementDto.paymentItems || settlement.paymentItems;
      const deductionItems =
        updateSettlementDto.deductionItems || settlement.deductionItems;

      const totalDue = paymentItems.reduce(
        (sum, item) => sum + Number(item.amount),
        0,
      );

      const totalDeduction = deductionItems.reduce(
        (sum, item) => sum + Number(item.amount),
        0,
      );

      updateData = {
        ...updateData,
        totalDue,
        totalDeduction,
        finalAmount: totalDue - totalDeduction,
      };
    }

    updateData.updatedBy = userId;

    await this.settlementRepository.update(id, updateData);
    return await this.findOne(id);
  }

  async remove(id: number, userId: number): Promise<void> {
    const settlement = await this.findOne(id);

    // Prevent deleting if already paid
    if (settlement.status === SettlementStatus.PAID) {
      throw new BadRequestException(
        'Cannot delete a settlement that has already been paid',
      );
    }

    await this.settlementRepository.softDelete(id);
    await this.settlementRepository.update(id, { deletedBy: userId });
  }

  async approve(id: number, userId: number): Promise<Settlement> {
    const settlement = await this.findOne(id);

    if (settlement.status !== SettlementStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Only settlements with pending approval status can be approved',
      );
    }

    await this.settlementRepository.update(id, {
      status: SettlementStatus.APPROVED,
      approvedBy: userId,
      approvedAt: new Date(),
      updatedBy: userId,
    });

    return await this.findOne(id);
  }

  async markAsPaid(id: number, userId: number): Promise<Settlement> {
    const settlement = await this.findOne(id);

    if (settlement.status !== SettlementStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved settlements can be marked as paid',
      );
    }

    await this.settlementRepository.update(id, {
      status: SettlementStatus.PAID,
      paidAt: new Date(),
      updatedBy: userId,
    });

    return await this.findOne(id);
  }

  /**
   * Get employee's hourly rate using the same logic as payroll
   * Priority: employee_skill.cost_price > skill.cost_price
   */
  private async getEmployeeHourlyRate(employeeId: number): Promise<number> {
    // Get employee's primary skill (first one assigned)
    const employeeSkill = await this.employeeSkillRepository.findOne({
      where: { employeeId },
      relations: ['skill'],
      order: { id: 'ASC' }, // Get the first/primary skill
    });

    if (employeeSkill && employeeSkill.cost_price) {
      return Number(employeeSkill.cost_price);
    }

    // Fallback to skill's base cost_price
    if (employeeSkill?.skill && employeeSkill.skill.cost_price) {
      return Number(employeeSkill.skill.cost_price);
    }

    // If no skill rate found, return 0
    return 0;
  }

  async calculateGratuity(employeeId: number, lastDateOfWork?: Date): Promise<{
    totalYearsOfService: number;
    gratuityAmount: number;
    eligibleDays: number;
    hourlyRate: number;
  }> {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    if (!employee.date_of_joining) {
      throw new BadRequestException(
        'Employee does not have a date of joining set',
      );
    }

    if (!employee.basic_salary) {
      throw new BadRequestException(
        'Employee does not have a basic salary set',
      );
    }

    const joinDate = new Date(employee.date_of_joining);
    const endDate = lastDateOfWork || new Date();

    // Calculate years of service
    const millisecondsPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const totalYearsOfService =
      (endDate.getTime() - joinDate.getTime()) / millisecondsPerYear;

    // Get hourly rate using payroll logic
    const hourlyRate = await this.getEmployeeHourlyRate(employeeId);

    // UAE Federal Law Gratuity Calculation
    // Uses BASIC SALARY ONLY (not allowances)
    const basicSalary = Number(employee.basic_salary);
    const dailySalary = basicSalary / 30;

    let gratuityAmount = 0;
    let eligibleDays = 0;

    // No gratuity for less than 1 year of service
    if (totalYearsOfService < 1) {
      gratuityAmount = 0;
      eligibleDays = 0;
    }
    // For first 5 years: (Basic Salary / 30) × 21 × Years of Service
    else if (totalYearsOfService < 5) {
      eligibleDays = Math.floor(totalYearsOfService * 21);
      gratuityAmount = dailySalary * 21 * totalYearsOfService;
    }
    // For 5 years and above: [(Basic Salary / 30) × 21 × 5] + [(Basic Salary / 30) × 30 × Remaining Years]
    else {
      const first5YearsDays = 5 * 21; // 105 days
      const remainingYears = totalYearsOfService - 5;
      const remainingYearsDays = Math.floor(remainingYears * 30);
      eligibleDays = first5YearsDays + remainingYearsDays;

      const first5YearsAmount = dailySalary * 21 * 5;
      const remainingYearsAmount = dailySalary * 30 * remainingYears;
      gratuityAmount = first5YearsAmount + remainingYearsAmount;
    }

    // Apply maximum cap: 2 years' total salary
    const maxGratuity = basicSalary * 24; // 2 years = 24 months
    if (gratuityAmount > maxGratuity) {
      gratuityAmount = maxGratuity;
    }

    return {
      totalYearsOfService: Math.round(totalYearsOfService * 100) / 100,
      gratuityAmount: Math.round(gratuityAmount * 100) / 100,
      eligibleDays,
      hourlyRate: Math.round(hourlyRate * 100) / 100,
    };
  }
}
