import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { TimesheetsService } from './timesheets.service';
import {
  CreateTimesheetDto,
  SaveTimesheetEntriesDto,
} from './dto/create-timesheet.dto';
import {
  UpdateTimesheetDto,
  SubmitTimesheetDto,
  ApproveTimesheetDto,
} from './dto/update-timesheet.dto';
import { TimesheetFiltersDto } from './dto/timesheet-filters.dto';

@Controller('timesheets')
@UseGuards(JwtAuthGuard)
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  /**
   * Get monthly project timesheet with data
   * GET /timesheets/project/:projectId/month/:month
   * Example: /timesheets/project/1/month/2024-01
   */
  @Get('project/:projectId/month/:month')
  async getMonthlyProjectTimesheet(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('month') month: string,
  ) {
    return await this.timesheetsService.getMonthlyProjectTimesheet(
      projectId,
      month,
    );
  }

  /**
   * Create or get timesheet
   * POST /timesheets
   */
  @Post()
  async createOrGetTimesheet(
    @Body() createTimesheetDto: CreateTimesheetDto,
    @Request() req,
  ) {
    return await this.timesheetsService.createOrGetTimesheet(
      createTimesheetDto,
      req.user.userId,
    );
  }

  /**
   * Save timesheet entries
   * PUT /timesheets/:id/entries
   */
  @Put(':id/entries')
  async saveTimesheetEntries(
    @Param('id', ParseIntPipe) id: number,
    @Body() saveEntriesDto: SaveTimesheetEntriesDto,
    @Request() req,
  ) {
    return await this.timesheetsService.saveTimesheetEntries(
      id,
      saveEntriesDto,
      req.user.userId,
    );
  }

  /**
   * Submit timesheet for approval
   * POST /timesheets/:id/submit
   */
  @Post(':id/submit')
  async submitTimesheet(
    @Param('id', ParseIntPipe) id: number,
    @Body() submitDto: SubmitTimesheetDto,
    @Request() req,
  ) {
    return await this.timesheetsService.submitTimesheet(
      id,
      submitDto,
      req.user.userId,
    );
  }

  /**
   * Approve or reject timesheet
   * POST /timesheets/:id/approve
   */
  @Post(':id/approve')
  async approveTimesheet(
    @Param('id', ParseIntPipe) id: number,
    @Body() approveDto: ApproveTimesheetDto,
    @Request() req,
  ) {
    return await this.timesheetsService.approveTimesheet(
      id,
      approveDto,
      req.user.userId,
    );
  }

  /**
   * Get all timesheets with filters
   * GET /timesheets
   */
  @Get()
  async findAll(@Query() filters: TimesheetFiltersDto) {
    return await this.timesheetsService.findAll(filters);
  }

  /**
   * Get a single timesheet by ID
   * GET /timesheets/:id
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.timesheetsService.findOne(id);
  }

  /**
   * Delete a timesheet
   * DELETE /timesheets/:id
   */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    await this.timesheetsService.remove(id, req.user.userId);
    return { message: 'Timesheet deleted successfully' };
  }
}
