import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { PayrollService } from './payroll.service';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { UpdatePayrollDto } from './dto/update-payroll.dto';
import { PayrollFiltersDto } from './dto/payroll-filters.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  /**
   * Get all payrolls with filters and pagination
   */
  @Get()
  @Permissions('payroll:read')
  async findAll(@Query() filters: PayrollFiltersDto) {
    return await this.payrollService.findAll(filters);
  }

  /**
   * Get payrolls for a specific month
   */
  @Get('month/:month')
  @Permissions('payroll:read')
  async findByMonth(@Param('month') month: string) {
    return await this.payrollService.findByMonth(month);
  }

  /**
   * Check if payroll exists for an employee and month
   */
  @Get('check/:employeeId/:month')
  @Permissions('payroll:read')
  async checkPayrollExists(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('month') month: string,
  ) {
    const payroll = await this.payrollService.findByEmployeeAndMonth(
      employeeId,
      month,
    );
    return { exists: !!payroll, payroll: payroll || null };
  }

  /**
   * Get a single payroll by ID
   */
  @Get(':id')
  @Permissions('payroll:read')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.payrollService.findOne(id);
  }

  /**
   * Create a new payroll entry
   */
  @Post()
  @Permissions('payroll:create')
  async create(@Body() createPayrollDto: CreatePayrollDto) {
    return await this.payrollService.create(createPayrollDto);
  }

  /**
   * Create or update payroll (upsert)
   */
  @Post('upsert')
  @Permissions('payroll:create', 'payroll:update')
  async createOrUpdate(@Body() createPayrollDto: CreatePayrollDto) {
    return await this.payrollService.createOrUpdate(createPayrollDto);
  }

  /**
   * Bulk create or update payrolls
   */
  @Post('bulk')
  @Permissions('payroll:create', 'payroll:update')
  async bulkCreateOrUpdate(@Body() payrolls: CreatePayrollDto[]) {
    return await this.payrollService.bulkCreateOrUpdate(payrolls);
  }

  /**
   * Update an existing payroll entry
   */
  @Put(':id')
  @Permissions('payroll:update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePayrollDto: UpdatePayrollDto,
  ) {
    return await this.payrollService.update(id, updatePayrollDto);
  }

  /**
   * Delete a payroll entry
   */
  @Delete(':id')
  @Permissions('payroll:delete')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.payrollService.remove(id);
    return { message: 'Payroll deleted successfully' };
  }

  /**
   * Calculate payroll for a specific month from approved timesheets
   */
  @Post('calculate/month/:month')
  @Permissions('payroll:create')
  async calculateForMonth(@Param('month') month: string) {
    return await this.payrollService.calculatePayrollForMonth(month);
  }

  /**
   * Calculate payroll for a specific project and month
   */
  @Post('calculate/project/:projectId/month/:month')
  @Permissions('payroll:create')
  async calculateForProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('month') month: string,
  ) {
    return await this.payrollService.calculatePayrollForProject(
      projectId,
      month,
    );
  }

  /**
   * Import allowances and deductions from Excel file
   */
  @Post('import-allowances-deductions/:month')
  @Permissions('payroll:update')
  @UseInterceptors(FileInterceptor('file'))
  async importAllowancesDeductions(
    @Param('month') month: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type
    if (
      !file.mimetype.includes('excel') &&
      !file.originalname.endsWith('.xlsx')
    ) {
      throw new BadRequestException(
        'Invalid file type. Please upload an Excel file (.xlsx)',
      );
    }

    return await this.payrollService.importAllowancesDeductions(
      file.buffer,
      month,
    );
  }

  /**
   * Download Excel template for allowances/deductions import
   */
  @Get('template/allowances-deductions')
  @Permissions('payroll:read')
  async downloadAllowancesDeductionsTemplate(@Res() res: Response) {
    const buffer = this.payrollService.generateAllowancesDeductionsTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=allowances_deductions_template.xlsx',
    );

    res.send(buffer);
  }
}
