import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
  Res,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './services/invoice-pdf.service';
import { CreateInvoiceDto, GenerateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto, MarkAsPaidDto } from './dto/update-invoice.dto';
import { InvoiceFiltersDto } from './dto/invoice-filters.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { User } from '../users/entities/user.entity';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  @Get()
  findAll(@Query() filters: InvoiceFiltersDto) {
    return this.invoicesService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.invoicesService.findOne(id);
  }

  @Post('generate')
  generate(@Body() dto: GenerateInvoiceDto, @CurrentUser() user: User) {
    return this.invoicesService.generateInvoice(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: User,
  ) {
    return this.invoicesService.update(id, dto, user.id);
  }

  @Post(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.invoicesService.approve(id, user.id);
  }

  @Post(':id/send')
  markAsSent(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.invoicesService.markAsSent(id, user.id);
  }

  @Post(':id/paid')
  markAsPaid(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkAsPaidDto,
    @CurrentUser() user: User,
  ) {
    return this.invoicesService.markAsPaid(id, dto, user.id);
  }

  @Post('actions/delete-many')
  removeMany(@Body('ids') ids: number[]) {
    return this.invoicesService.removeMany(ids);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.invoicesService.remove(id);
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const invoice = await this.invoicesService.findOne(id);
    const pdfBuffer = await this.invoicePdfService.generatePdf(invoice);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Invoice-${invoice.invoiceNumber}.pdf`,
    );
    res.send(pdfBuffer);
  }
}

