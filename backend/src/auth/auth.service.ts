import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { ConfigService } from '@nestjs/config';
import { Role } from './interfaces/jwt-payload.interface';
import { SafeUserDto } from './dto/safe-user.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, role = Role.STUDENT, name } = registerDto;
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationTokenRaw = this.generateVerificationToken();
    const verificationTokenHash = this.hashToken(verificationTokenRaw);
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      name,
      role,
      verificationToken: verificationTokenHash,
      verificationExpiry,
    });

    await this.emailService.sendVerificationEmail(
      email,
      verificationTokenRaw,
      user.id,
      name,
    );
    const safeUser = this.toSafeUser(user);

    return {
      message:
        'Registration successful. Please check your email to verify your account.',
      userId: user.id,
      user: safeUser,
    };
  }

  async login(user: any) {
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Please verify your email before logging in',
      );
    }

    const safeUser = this.toSafeUser(user);
    const accessToken = this.generateAccessToken(safeUser);
    const refreshToken = this.generateRefreshToken(safeUser);

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);
    await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);

    return { accessToken, refreshToken, user: safeUser };
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async logout(userId: number) {
    await this.usersService.updateRefreshToken(userId, null);
    return { message: 'Logged out successfully' };
  }

  async refreshToken(userId: number, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const safeUser = this.toSafeUser(user);
    const newAccessToken = this.generateAccessToken(safeUser);
    const newRefreshToken = this.generateRefreshToken(safeUser);

    const hashedRefreshToken = await bcrypt.hash(newRefreshToken, 12);
    await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async verifyEmail(token: string) {
    const tokenHash = this.hashToken(token);
    const user = await this.usersService.findByVerificationToken(tokenHash);
    if (!user) {
      throw new ForbiddenException('Invalid verification token');
    }
    if (!user.verificationExpiry || new Date() > user.verificationExpiry) {
      throw new ForbiddenException('Verification token has expired');
    }
    await this.usersService.verifyEmail(user.id);
    await this.emailService.sendWelcomeEmail(user.email, user.id);
    return { message: 'Email verified successfully' };
  }

  async validateRefreshToken(token: string): Promise<any> {
    const payload = this.jwtService.verify(token, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
    });
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return payload;
  }

  async validateRefreshHash(userId: number, token: string): Promise<boolean> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshToken) {
      return false;
    }
    return bcrypt.compare(token, user.refreshToken);
  }

  private generateAccessToken(user: SafeUserDto): string {
    return this.jwtService.sign(
      {
        email: user.email,
        sub: user.id,
        role: user.role || Role.STUDENT,
      },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
  }

  private generateRefreshToken(user: SafeUserDto): string {
    return this.jwtService.sign(
      {
        email: user.email,
        sub: user.id,
        role: user.role || Role.STUDENT,
      },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );
  }

  private generateVerificationToken(): string {
    return require('crypto').randomUUID();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toSafeUser(user: any): SafeUserDto {
    const safeUser = new SafeUserDto();
    safeUser.id = user.id;
    safeUser.email = user.email;
    safeUser.createdAt = user.createdAt;
    safeUser.updatedAt = user.updatedAt;
    safeUser.role = user.role;
    safeUser.isEmailVerified = user.isEmailVerified;
    return safeUser;
  }
}
