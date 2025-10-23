import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import {
  LoginDto,
  RegisterDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { InvitationService } from '../invitations/invitation.service';
import { EmailService } from '../../email/email.service';
import { passwordResetEmailTemplate } from '../../email/templates/password-reset.template';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'password'>;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly invitationService: InvitationService,
    private readonly emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    // Public registration is disabled - users must be invited
    throw new UnauthorizedException(
      'Public registration is disabled. Please use an invitation link to register.',
    );
  }

  async registerWithInvitation(
    registerDto: RegisterDto,
    invitationToken: string,
  ): Promise<AuthResponse> {
    const { email, password, firstName, lastName } = registerDto;

    // Validate invitation token
    const invitation = await this.validateInvitationToken(invitationToken);

    if (invitation.email !== email) {
      throw new UnauthorizedException('Email does not match invitation');
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await this.hashPassword(password);

    // Create user with invitation details
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: invitation.role,
      permissions: invitation.permissions,
      isActive: true,
    });

    const savedUser = await this.userRepository.save(user);

    // Generate tokens
    const tokens = await this.generateTokens(savedUser);

    return {
      ...tokens,
      user: this.sanitizeUser(savedUser),
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const { email, password } = loginDto;

    const user = await this.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: this.sanitizeUser(user),
    };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('auth.jwtRefreshSecret'),
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      return {
        ...tokens,
        user: this.sanitizeUser(user),
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;

    // Find user by email
    const user = await this.userRepository.findOne({
      where: { email: ILike(email) },
    });

    if (!user || !user.isActive) {
      // Don't reveal if user exists or not for security
      return {
        message:
          'If the email exists in our system, you will receive a password reset link.',
      };
    }

    // Generate password reset token
    const resetToken = this.generatePasswordResetToken(user.email);

    // Send password reset email
    await this.sendPasswordResetEmail(user.email, resetToken);

    return {
      message:
        'If the email exists in our system, you will receive a password reset link.',
    };
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const { token, newPassword } = resetPasswordDto;

    // Validate token and get user
    const user = await this.validatePasswordResetToken(token);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    // Hash new password
    const hashedNewPassword = await this.hashPassword(newPassword);

    // Update user password
    await this.userRepository.update(user.id, {
      password: hashedNewPassword,
    });

    return {
      message: 'Password has been reset successfully',
    };
  }

  async getUserWithPassword(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: ILike(email) },
      select: ['id', 'email', 'password', 'isActive', 'role', 'permissions'],
    });
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.getUserWithPassword(email);
    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await this.comparePassword(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async validateUserById(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id, isActive: true } });
  }

  async getCurrentUser(id: number): Promise<Omit<User, 'password'>> {
    const user = await this.userRepository.findOne({
      where: { id, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.sanitizeUser(user);
  }

  private async hashPassword(password: string): Promise<string> {
    const rounds = this.configService.get<number>('auth.bcryptRounds') || 12;
    return await bcrypt.hash(password, rounds);
  }

  private async comparePassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  private async generateTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
    };

    const accessToken = this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('auth.jwtSecret') || 'default-secret',
      expiresIn: (this.configService.get<string>('auth.jwtExpiresIn') ||
        '24h') as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('auth.jwtRefreshSecret') ||
        'default-refresh-secret',
      expiresIn: (this.configService.get<string>('auth.jwtRefreshExpiresIn') ||
        '7d') as any,
    });

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: User): Omit<User, 'password'> {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  private async validateInvitationToken(token: string) {
    return this.invitationService.validateInvitationToken(token);
  }

  private generatePasswordResetToken(email: string): string {
    // Generate a JWT token with user email and expiry
    const payload = {
      type: 'password_reset',
      email: email,
      timestamp: Date.now(),
    };

    return this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('auth.jwtSecret') || 'default-secret',
      expiresIn: '1h', // Token expires in 1 hour
    });
  }

  private async validatePasswordResetToken(
    token: string,
  ): Promise<User | null> {
    try {
      const payload = this.jwtService.verify(token, {
        secret:
          this.configService.get<string>('auth.jwtSecret') || 'default-secret',
      });

      if (payload.type !== 'password_reset' || !payload.email) {
        return null;
      }

      // Find user by email from token
      const user = await this.userRepository.findOne({
        where: { email: payload.email, isActive: true },
      });

      return user;
    } catch (error) {
      return null;
    }
  }

  private async sendPasswordResetEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const baseUrl =
      this.configService.get('app.frontendUrl') || 'http://localhost:5173';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    const html = passwordResetEmailTemplate(resetUrl);

    await this.emailService.sendMail({
      to: email,
      subject: 'Password Reset Request - ADAA Employment LLC',
      html,
    });
  }
}
