import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { CreateInvitationDto, AcceptInvitationDto } from './dto/invitation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('invitations')
@UseGuards(JwtAuthGuard)
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Post()
  @Roles('admin', 'manager')
  @Permissions('user:create')
  async createInvitation(
    @Body() createInvitationDto: CreateInvitationDto,
    @Request() req: any,
  ) {
    return this.invitationService.createInvitation(
      createInvitationDto,
      req.user.id,
    );
  }

  @Post('accept')
  @Public()
  async acceptInvitation(@Body() acceptInvitationDto: AcceptInvitationDto) {
    return this.invitationService.acceptInvitation(acceptInvitationDto);
  }

  @Get('validate/:token')
  @Public()
  async validateInvitation(@Param('token') token: string) {
    return this.invitationService.validateInvitationToken(token);
  }

  @Post('complete-signup')
  @Public()
  async completeSignup(@Body() acceptInvitationDto: AcceptInvitationDto) {
    return this.invitationService.acceptInvitation(acceptInvitationDto);
  }

  @Get('my-invitations')
  async getMyInvitations(@Request() req: any) {
    return this.invitationService.getInvitationsByInviter(req.user.id);
  }

  @Patch(':id/cancel')
  @Roles('admin', 'manager')
  @Permissions('user:create')
  async cancelInvitation(
    @Param('id') invitationId: string,
    @Request() req: any,
  ) {
    await this.invitationService.cancelInvitation(+invitationId, req.user.id);
    return { message: 'Invitation cancelled successfully' };
  }

  @Post(':id/resend')
  @Roles('admin', 'manager')
  @Permissions('user:create')
  async resendInvitation(
    @Param('id') invitationId: string,
    @Request() req: any,
  ) {
    await this.invitationService.resendInvitation(+invitationId, req.user.id);
    return { message: 'Invitation resent successfully' };
  }
}
