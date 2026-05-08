import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EmailService } from './email.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('email')
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Public()
  @Get('track/open/:id')
  @ApiOperation({ summary: 'Track email open via tracking pixel' })
  async trackOpen(@Param('id') id: string) {
    const emailLogId = parseInt(id, 10);
    if (isNaN(emailLogId)) {
      return { error: 'Invalid email log ID' };
    }
    await this.emailService.markAsOpened(emailLogId);
    return { success: true };
  }

  @Public()
  @Get('track/click')
  @ApiOperation({ summary: 'Track email click' })
  async trackClick(@Query('id') id: string) {
    const emailLogId = parseInt(id, 10);
    if (isNaN(emailLogId)) {
      return { error: 'Invalid email log ID' };
    }
    await this.emailService.markAsClicked(emailLogId);
    return { success: true, url: '/dashboard' };
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Webhook endpoint for email provider events (bounce, complaint, delivery)' })
  @ApiBody({ description: 'Webhook event payload (provider-specific)' })
  async webhook(@Body() body: Record<string, unknown>) {
    const event = body.event as string | undefined;
    const email = body.email as string | undefined;
    const email_log_id = body.email_log_id as string | undefined;

    if (!event || !email) {
      return { success: false, error: 'Missing required fields' };
    }

    const emailLogId = email_log_id ? parseInt(email_log_id, 10) : null;

    switch (event.toLowerCase()) {
      case 'bounce':
      case 'complaint':
        await this.emailService['addToSuppression'](email, 'BOUNCE', { event, details: body });
        if (emailLogId) {
          await this.emailService['prisma'].emailLog.update({
            where: { id: emailLogId },
            data: { status: event === 'bounce' ? 'BOUNCED' : 'REJECTED', errorMessage: body.error as string },
          });
        }
        break;
      case 'delivery':
        if (emailLogId) {
          await this.emailService['prisma'].emailLog.update({
            where: { id: emailLogId },
            data: { status: 'DELIVERED', deliveredAt: new Date() },
          });
        }
        break;
      case 'open':
        if (emailLogId) {
          await this.emailService.markAsOpened(emailLogId);
        }
        break;
      case 'click':
        if (emailLogId) {
          await this.emailService.markAsClicked(emailLogId);
        }
        break;
      default:
        this.emailService['logger'].warn(`Unknown webhook event: ${event}`);
    }

    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('logs')
  @ApiOperation({ summary: 'Get email logs (admin only)' })
  @ApiResponse({ status: 200, description: 'Returns email logs' })
  getEmailLogs(@Query('limit') limit = 50, @Query('offset') offset = 0) {
    return this.emailService.getEmailLogs(Number(limit), Number(offset));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('stats')
  @ApiOperation({ summary: 'Get email statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Returns email stats' })
  getEmailStats() {
    return this.emailService.getEmailStats();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('retry/:id')
  @ApiOperation({ summary: 'Retry a failed email (admin only)' })
  @ApiResponse({ status: 200, description: 'Email retry scheduled' })
  async retryEmail(@Param('id') id: string) {
    const emailLogId = parseInt(id, 10);
    return this.emailService.retryEmail(emailLogId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('suppressions')
  @ApiOperation({ summary: 'Get suppression list (admin only)' })
  getSuppressions(@Query('limit') limit = 50, @Query('offset') offset = 0) {
    return this.emailService.getSuppressionList(Number(limit), Number(offset));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('suppressions/remove')
  @ApiOperation({ summary: 'Remove email from suppression list (admin only)' })
  @ApiBody({ description: 'Email to remove', schema: { example: { email: 'user@example.com' } } })
  async removeSuppression(@Body('email') email: string) {
    return this.emailService.removeSuppression(email);
  }

  @Public()
  @Get('preview/:template')
  @ApiOperation({ summary: 'Preview email template (development only)' })
  async previewTemplate(@Param('template') template: string, @Query('data') dataJson?: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Preview not available in production');
    }

    let data: Record<string, unknown> = {};
    if (dataJson) {
      try {
        data = JSON.parse(dataJson);
      } catch (e) {
        // ignore parse errors
      }
    }

    // Access private template methods (for dev only)
    const service = this.emailService as any;
    const templateMap: Record<string, (payload: Record<string, unknown>) => string> = {
      verification: (p) => service.getVerificationTemplate({ payload: p }),
      welcome: (p) => service.getWelcomeTemplate(p),
      'password-reset': (p) => service.getPasswordResetTemplate(p),
      notification: (p) => service.getNotificationTemplate(p),
      'account-locked': (p) => service.getAccountLockedTemplate(p),
    };

    const renderer = templateMap[template];
    if (!renderer) {
      return { error: 'Template not found', available: Object.keys(templateMap) };
    }

    const html = renderer(data);
    return { html };
  }
}
