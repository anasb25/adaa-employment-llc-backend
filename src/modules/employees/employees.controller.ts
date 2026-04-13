import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
import { ImportResult } from './dto/import-employee.dto';

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
  @Get('actions/export')
  async exportEmployees(@Res() res: Response) {
    const buffer = await this.employeesService.exportEmployees();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=employees_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );

    res.send(buffer);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get('actions/import-template')
  getImportTemplate(@Res() res: Response) {
    const buffer = this.employeesService.generateImportTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=employee_import_template.xlsx',
    );

    res.send(buffer);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:create')
  @Post('actions/import')
  @UseInterceptors(FileInterceptor('file'))
  async importEmployees(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (
      !file.mimetype.includes('spreadsheet') &&
      !file.mimetype.includes('excel') &&
      !file.originalname.endsWith('.xlsx')
    ) {
      throw new BadRequestException(
        'Invalid file type. Please upload an Excel file (.xlsx)',
      );
    }

    return await this.employeesService.importEmployees(file.buffer);
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
  @Permissions('employee:read')
  @Get('actions/with-timesheet-status')
  async getEmployeesWithTimesheetStatus(
    @Query('date') date: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );

    return await this.employeesService.getEmployeesWithTimesheetStatus(
      date,
      status,
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
  @Post('actions/delete-many')
  removeMany(@Body('ids') ids: number[]) {
    return this.employeesService.removeMany(ids);
  }

  @Roles('admin')
  @Permissions('employee:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.employeesService.remove(+id);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Post(':id/actions/decrement-air-ticket')
  decrementAirTicket(@Param('id') id: string) {
    return this.employeesService.decrementAirTicket(+id);
  }
}
