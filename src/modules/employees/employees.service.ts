import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Employee } from './entities/employee.entity';
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
  ) {}

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Employee>> {
    return await PaginationUtil.paginate(this.employeeRepository, options, {
      relations: ['employeeSkills', 'employeeSkills.skill'],
      order: { createdAt: 'DESC' },
    });
  }

  async searchEmployees(
    query: string,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Employee>> {
    const searchTerm = `%${query}%`;

    return await PaginationUtil.paginate(this.employeeRepository, options, {
      relations: ['employeeSkills', 'employeeSkills.skill'],
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
      relations: ['employeeSkills', 'employeeSkills.skill'],
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
}
