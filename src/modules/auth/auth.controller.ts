import { Body, Controller, Post } from '@nestjs/common';
import { AuthService, AuthResponse } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { AcceptInvitationDto } from '../invitations/dto/invitation.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<AuthResponse> {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Public()
  @Post('register-with-invitation')
  async registerWithInvitation(
    @Body() acceptInvitationDto: AcceptInvitationDto,
  ): Promise<AuthResponse> {
    return this.authService.registerWithInvitation(
      {
        email: acceptInvitationDto.email,
        password: acceptInvitationDto.password,
        firstName: acceptInvitationDto.firstName,
        lastName: acceptInvitationDto.lastName,
      },
      acceptInvitationDto.token,
    );
  }
}
