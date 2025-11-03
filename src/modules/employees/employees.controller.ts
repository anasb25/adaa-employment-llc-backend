import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import {
  PaginationUtil,
  PaginatedResponse,
} from '../../common/utils/pagination.util';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<Employee>> {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );
    return await this.employeesService.findAllPaginated(paginationOptions);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(+id);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:create')
  @Post()
  create(
    @Body() createEmployeeDto: CreateEmployeeDto,
    @CurrentUser() user: User,
  ) {
    // Convert date strings to Date objects
    const employeeData: any = {
      ...createEmployeeDto,
      createdBy: user.id,
    };

    // Convert date strings to Date objects if they exist
    const dateFields = [
      'dob',
      'pp_expiry',
      'emirates_id_expiry',
      'visa_expiry',
      'work_permit_expiry',
      'date_of_joining',
      'date_of_arrival',
    ];
    dateFields.forEach((field) => {
      if (employeeData[field]) {
        employeeData[field] = new Date(employeeData[field]);
      }
    });

    return this.employeesService.create(employeeData);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get('actions/search')
  async searchEmployees(
    @Query('q') query: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<Employee>> {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );

    return await this.employeesService.searchEmployees(
      query,
      paginationOptions,
    );
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
    @CurrentUser() user: User,
  ) {
    // Convert date strings to Date objects
    const employeeData: any = {
      ...updateEmployeeDto,
      updatedBy: user.id,
    };

    // Convert date strings to Date objects if they exist
    const dateFields = [
      'dob',
      'pp_expiry',
      'emirates_id_expiry',
      'visa_expiry',
      'work_permit_expiry',
      'date_of_joining',
      'date_of_arrival',
    ];
    dateFields.forEach((field) => {
      if (employeeData[field]) {
        employeeData[field] = new Date(employeeData[field]);
      }
    });

    return await this.employeesService.update(+id, employeeData);
  }

  @Roles('admin')
  @Permissions('employee:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.employeesService.remove(+id);
  }
}
