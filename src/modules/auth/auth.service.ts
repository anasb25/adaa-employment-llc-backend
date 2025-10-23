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
import { LoginDto, RegisterDto, ForgotPasswordDto } from './dto/auth.dto';

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
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const {
      email,
      password,
      firstName,
      lastName,
      role = 'user',
      permissions = [],
    } = registerDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await this.hashPassword(password);

    // Create user
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role,
      permissions,
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
    const { email, oldPassword, newPassword } = forgotPasswordDto;

    // Find user by email
    const user = await this.getUserWithPassword(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or user not found');
    }
    // Verify old password
    const isOldPasswordValid = await this.comparePassword(
      oldPassword,
      user.password,
    );
    if (!isOldPasswordValid) {
      throw new UnauthorizedException('Invalid old password');
    }

    // Hash new password
    const hashedNewPassword = await this.hashPassword(newPassword);

    // Update user password
    await this.userRepository.update(user.id, {
      password: hashedNewPassword,
    });

    return {
      message: 'Password updated successfully',
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
}
