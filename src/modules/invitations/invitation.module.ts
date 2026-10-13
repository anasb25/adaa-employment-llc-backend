import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { Invitation } from './entities/invitation.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { EmailService } from '../../email/email.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Invitation, User, Role]), UsersModule],
  controllers: [InvitationController],
  providers: [InvitationService, EmailService],
  exports: [InvitationService],
})
export class InvitationModule {}
