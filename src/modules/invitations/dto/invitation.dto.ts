import {
  IsEmail,
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { InvitationStatus } from '../entities/invitation.entity';

export class CreateInvitationDto {
  @IsEmail()
  email: string;

  @IsNumber()
  roleId: number;
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
  role: {
    id: number;
    name: string;
    description: string;
  };
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
