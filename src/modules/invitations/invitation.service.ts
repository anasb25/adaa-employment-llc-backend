import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Invitation, InvitationStatus } from './entities/invitation.entity';
import { User } from '../users/entities/user.entity';
import { CreateInvitationDto, AcceptInvitationDto } from './dto/invitation.dto';
import { EmailService } from '../../email/email.service';
import { invitationEmailTemplate } from '../../email/templates/invitation.template';
import * as crypto from 'crypto';

@Injectable()
export class InvitationService {
  constructor(
    @InjectRepository(Invitation)
    private invitationRepository: Repository<Invitation>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async createInvitation(
    createInvitationDto: CreateInvitationDto,
    inviterId: number,
  ): Promise<Invitation> {
    const { email, role, permissions = [] } = createInvitationDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Check if there's already a pending invitation
    const existingInvitation = await this.invitationRepository.findOne({
      where: { email, status: InvitationStatus.PENDING },
    });

    if (existingInvitation) {
      throw new BadRequestException('Invitation already sent to this email');
    }

    // Generate invitation token
    const token = this.generateInvitationToken();

    // Set expiry date (default 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation
    const invitation = this.invitationRepository.create({
      email,
      role,
      permissions,
      token,
      expiresAt,
      inviterId,
      status: InvitationStatus.PENDING,
    });

    const savedInvitation = await this.invitationRepository.save(invitation);

    // Send invitation email
    await this.sendInvitationEmail(savedInvitation);

    return savedInvitation;
  }

  async acceptInvitation(
    acceptInvitationDto: AcceptInvitationDto,
  ): Promise<{ user: User; invitation: Invitation }> {
    const { token, firstName, lastName, password } = acceptInvitationDto;

    // Find invitation by token
    const invitation = await this.invitationRepository.findOne({
      where: { token },
      relations: ['inviter'],
    });

    if (!invitation) {
      throw new NotFoundException('Invalid invitation token');
    }

    // Check if invitation is still valid
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        'Invitation has already been used or expired',
      );
    }

    if (new Date() > invitation.expiresAt) {
      // Mark as expired
      invitation.status = InvitationStatus.EXPIRED;
      await this.invitationRepository.save(invitation);
      throw new BadRequestException('Invitation has expired');
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: invitation.email },
    });

    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Create new user
    const user = this.userRepository.create({
      email: invitation.email,
      firstName,
      lastName,
      password, // Password will be hashed by the user entity
      role: invitation.role,
      permissions: invitation.permissions,
      isActive: true,
    });

    const savedUser = await this.userRepository.save(user);

    // Update invitation
    invitation.status = InvitationStatus.ACCEPTED;
    invitation.acceptedAt = new Date();
    invitation.acceptedById = savedUser.id;
    await this.invitationRepository.save(invitation);

    return { user: savedUser, invitation };
  }

  async getInvitationsByInviter(inviterId: number): Promise<Invitation[]> {
    return this.invitationRepository.find({
      where: { inviterId },
      relations: ['inviter', 'acceptedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async cancelInvitation(
    invitationId: number,
    inviterId: number,
  ): Promise<void> {
    const invitation = await this.invitationRepository.findOne({
      where: { id: invitationId, inviterId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        'Cannot cancel invitation that is not pending',
      );
    }

    invitation.status = InvitationStatus.CANCELLED;
    await this.invitationRepository.save(invitation);
  }

  async resendInvitation(
    invitationId: number,
    inviterId: number,
  ): Promise<void> {
    const invitation = await this.invitationRepository.findOne({
      where: { id: invitationId, inviterId },
      relations: ['inviter'],
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        'Cannot resend invitation that is not pending',
      );
    }

    // Generate new token and extend expiry
    invitation.token = this.generateInvitationToken();
    invitation.expiresAt = new Date();
    invitation.expiresAt.setDate(invitation.expiresAt.getDate() + 7);

    await this.invitationRepository.save(invitation);
    await this.sendInvitationEmail(invitation);
  }

  private generateInvitationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async sendInvitationEmail(invitation: Invitation): Promise<void> {
    const html = invitationEmailTemplate({
      inviter: invitation.inviter,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      token: invitation.token,
    });

    await this.emailService.sendMail({
      to: invitation.email,
      subject: 'Invitation to Join ADAA',
      html,
    });
  }

  async validateInvitationToken(token: string): Promise<Invitation> {
    const invitation = await this.invitationRepository.findOne({
      where: { token },
    });

    if (!invitation) {
      throw new NotFoundException('Invalid invitation token');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Invitation has already been used');
    }

    if (new Date() > invitation.expiresAt) {
      throw new BadRequestException('Invitation has expired');
    }

    return invitation;
  }
}
