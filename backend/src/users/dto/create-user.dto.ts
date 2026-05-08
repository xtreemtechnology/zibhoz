import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsEnum,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../auth/interfaces/jwt-payload.interface';

export class CreateUserDto {
  @ApiProperty({
    example: 'student@zibhoz.com',
    description: 'Valid email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: 'Test@1234!',
    description: 'Min 8 chars, uppercase, lowercase, number, special char',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  password!: string;

  @ApiPropertyOptional({
    enum: Role,
    example: Role.STUDENT,
    description: 'User role',
  })
  @IsOptional()
  @IsEnum(Role, { message: 'Role must be STUDENT, TEACHER, or ADMIN' })
  role?: Role;

  @ApiPropertyOptional({ type: Boolean, description: 'Email verified status' })
  @IsOptional()
  isEmailVerified?: boolean;

  @ApiPropertyOptional({ type: String, description: 'Full name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ type: String, description: 'Verification token hash' })
  @IsOptional()
  @IsString()
  verificationToken?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Verification expiry date',
  })
  @IsOptional()
  verificationExpiry?: Date;
}
