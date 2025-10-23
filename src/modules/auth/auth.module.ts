import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { InvitationModule } from '../invitations/invitation.module';
import { EmailService } from '../../email/email.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    InvitationModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('auth.jwtSecret') || 'default-secret',
        signOptions: {
          expiresIn: (configService.get<string>('auth.jwtExpiresIn') ||
            '24h') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, EmailService],
  exports: [AuthService],
})
export class AuthModule {}
