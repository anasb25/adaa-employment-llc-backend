import {
  IsEmail,
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { InvitationStatus } from '../entities/invitation.entity';

export class CreateInvitationDto {
  @IsEmail()
  email: string;

  @IsString()
  role: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissions?: string[];
}

export class AcceptInvitationDto {
  @IsString()
  token: string;

  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  password: string;
}

export class InvitationResponseDto {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  status: InvitationStatus;
  expiresAt: Date;
  inviter: {
    id: string;
    firstName: string;
    lastName: string;
  };
  createdAt: Date;
  acceptedAt?: Date;
}
