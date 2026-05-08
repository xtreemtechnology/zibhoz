import {
  Controller,
  Post,
  Get,
  UseGuards,
  Req,
  Body,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshGuard } from './guards/refresh.guard';
import { CurrentUser } from './decorators/get-user.decorator';
import { Public } from './decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { Role } from './interfaces/jwt-payload.interface';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  @Public()
  @Throttle({ limit: 10, ttl: 3600000 } as any)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({
    type: RegisterDto,
    examples: {
      student: {
        summary: 'Student registration',
        value: {
          email: 'student@zibhoz.com',
          password: 'Test@1234!',
          role: Role.STUDENT,
          name: 'Ada Lovelace',
        },
      },
      teacher: {
        summary: 'Teacher registration',
        value: {
          email: 'teacher@zibhoz.com',
          password: 'Teach@5678!',
          role: Role.TEACHER,
          name: 'Grace Hopper',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'User registered. Verification email sent.',
    schema: {
      example: {
        message: 'Registration successful. Please verify your email.',
        userId: 'uuid-here',
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @Throttle({ limit: 5, ttl: 900000 } as any)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({
    type: LoginDto,
    examples: {
      student: {
        summary: 'Student login',
        value: { email: 'student@zibhoz.com', password: 'Test@1234!' },
      },
      teacher: {
        summary: 'Teacher login',
        value: { email: 'teacher@zibhoz.com', password: 'Teach@5678!' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiJ9...',
        user: {
          id: 'uuid',
          email: 'student@zibhoz.com',
          role: Role.STUDENT,
          name: 'Ada Lovelace',
          isEmailVerified: true,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Email not verified' })
  @ApiResponse({
    status: 429,
    description: 'Too many attempts. Try again in 15 minutes.',
  })
  login(@CurrentUser() user: any) {
    return this.authService.login(user);
  }

  @UseGuards(RefreshGuard)
  @Post('refresh')
  @ApiBearerAuth('refresh-token')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'New token pair issued',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiJ9...',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  refresh(@Req() req: any) {
    const user = req.user;
    const refreshToken = req.refreshToken;
    return this.authService.refreshToken(user.sub, refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    schema: {
      example: { message: 'Logged out successfully' },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  logout(@CurrentUser() user: any) {
    return this.authService.logout(user.sub);
  }

  @Get('verify-email')
  @Public()
  @ApiOperation({ summary: 'Verify email address via token from email link' })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Verification token from email',
    example: 'abc123uuid',
  })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  verifyEmail(@Req() req: any) {
    const token = req.query.token as string;
    if (!token) {
      throw new Error('Verification token is required');
    }
    return this.authService.verifyEmail(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile',
    schema: {
      example: {
        id: 'uuid',
        email: 'student@zibhoz.com',
        role: Role.STUDENT,
        name: 'Ada Lovelace',
        isEmailVerified: true,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: any) {
    const fullUser = await this.usersService.findById(user.sub);
    if (!fullUser) {
      throw new NotFoundException('User not found');
    }
    const {
      password,
      refreshToken,
      verificationToken,
      verificationExpiry,
      ...safeUser
    } = fullUser;
    return safeUser;
  }
}
