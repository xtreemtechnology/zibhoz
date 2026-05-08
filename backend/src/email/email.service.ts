import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailStatus, EmailType, EmailLog } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

interface EmailPayload {
  userId?: number;
  recipient: string;
  subject: string;
  template: string;
  data?: Record<string, unknown>;
  type: EmailType;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly maxRetries: number;
  private readonly retryDelays: number[];
  private readonly rateLimitMax: number;
  private readonly rateLimitWindow: number;

  constructor(
    private readonly mailerService: MailerService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.maxRetries = parseInt(process.env.EMAIL_MAX_RETRIES || '5', 10);
    this.retryDelays = (process.env.EMAIL_RETRY_DELAYS || '60000,300000,900000,3600000,14400000')
      .split(',')
      .map(d => parseInt(d.trim(), 10))
      .filter(d => !isNaN(d) && d > 0);
    this.rateLimitMax = parseInt(process.env.EMAIL_RATE_LIMIT_MAX || '100', 10);
    this.rateLimitWindow = parseInt(process.env.EMAIL_RATE_LIMIT_WINDOW || '3600000', 10);
  }

  async sendVerificationEmail(email: string, token: string, userId: number, name?: string) {
    const verificationUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/v1/auth/verify-email?token=${token}`;
    const payload: EmailPayload = {
      userId,
      recipient: email,
      subject: 'Verify your Zibhoz account',
      template: 'verification',
      data: { verificationUrl, name, email },
      type: EmailType.EMAIL_VERIFICATION,
    };
    return this.queueEmail(payload);
  }

  async sendWelcomeEmail(email: string, userId: number, name?: string) {
    const payload: EmailPayload = {
      userId,
      recipient: email,
      subject: 'Welcome to Zibhoz!',
      template: 'welcome',
      data: { name, email, loginUrl: `${process.env.APP_URL || 'http://localhost:3000'}/login` },
      type: EmailType.WELCOME,
    };
    return this.queueEmail(payload);
  }

  async sendPasswordResetEmail(email: string, token: string, userId: number, name?: string) {
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    const payload: EmailPayload = {
      userId,
      recipient: email,
      subject: 'Reset your Zibhoz password',
      template: 'password-reset',
      data: { resetUrl, name, email },
      type: EmailType.PASSWORD_RESET,
    };
    return this.queueEmail(payload);
  }

  async sendNotificationEmail(email: string, userId: number, title: string, message: string, actionUrl?: string) {
    const payload: EmailPayload = {
      userId,
      recipient: email,
      subject: title,
      template: 'notification',
      data: { title, message, actionUrl, email },
      type: EmailType.NOTIFICATION,
    };
    return this.queueEmail(payload);
  }

  async sendAccountLockedEmail(email: string, userId: number, name?: string) {
    const payload: EmailPayload = {
      userId,
      recipient: email,
      subject: 'Your Zibhoz account has been locked',
      template: 'account-locked',
      data: { name, email, supportUrl: `${process.env.APP_URL || 'http://localhost:3000'}/support` },
      type: EmailType.ACCOUNT_LOCKED,
    };
    return this.queueEmail(payload);
  }

  private async queueEmail(payload: EmailPayload): Promise<EmailLog> {
    const recipientLower = payload.recipient.toLowerCase();

    // Check suppression
    const isSuppressed = await this.prisma.emailSuppression.findUnique({
      where: { email: recipientLower },
    });

    if (isSuppressed) {
      this.logger.warn(`Email to ${payload.recipient} suppressed`);
      return this.prisma.emailLog.create({
        data: {
          userId: payload.userId,
          recipient: payload.recipient,
          subject: payload.subject,
          type: payload.type,
          templateName: payload.template,
          payload: payload.data as any,
          status: EmailStatus.REJECTED,
          errorMessage: 'Recipient is suppressed',
          retryCount: this.maxRetries,
        },
      });
    }

    // Rate limiting
    const rateLimit = await this.prisma.emailRateLimit.findUnique({
      where: { recipient: recipientLower },
    });

    if (rateLimit && rateLimit.count >= this.rateLimitMax) {
      const windowEnd = new Date(rateLimit.windowStart.getTime() + this.rateLimitWindow);
      if (new Date() < windowEnd) {
        this.logger.warn(`Rate limit exceeded for ${payload.recipient}`);
        throw new Error(`Rate limit exceeded. Try again after ${windowEnd.toISOString()}`);
      }
    }

    // Deduplication
    const existingLog = await this.prisma.emailLog.findFirst({
      where: {
        recipient: payload.recipient,
        subject: payload.subject,
        status: { in: [EmailStatus.QUEUED, EmailStatus.SENDING] },
        createdAt: { gte: new Date(Date.now() - 3600000) },
      },
    });

    if (existingLog) {
      this.logger.warn(`Email already queued for ${payload.recipient}, skipping duplicate`);
      return existingLog;
    }

    // Create log
    const emailLog = await this.prisma.emailLog.create({
      data: {
        userId: payload.userId,
        recipient: payload.recipient,
        subject: payload.subject,
        type: payload.type,
        templateName: payload.template,
        payload: payload.data as any,
        status: EmailStatus.QUEUED,
        retryCount: 0,
      },
    });

    // Update rate limit
    await this.updateRateLimit(recipientLower);

    // Process immediately
    try {
      return await this.processEmail(emailLog);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to send email ${emailLog.id}: ${err.message}`, err.stack);

      if (emailLog.retryCount < this.maxRetries - 1) {
        const delay = this.retryDelays[emailLog.retryCount] || 60000;
        this.logger.warn(`Scheduling retry ${emailLog.retryCount + 1}/${this.maxRetries} for email ${emailLog.id} in ${delay}ms`);

        await this.prisma.emailLog.update({
          where: { id: emailLog.id },
          data: {
            retryCount: { increment: 1 },
            nextRetryAt: new Date(Date.now() + delay),
            status: EmailStatus.QUEUED,
            errorMessage: err.message,
          },
        });

        setTimeout(() => this.sendEmailById(emailLog.id), delay).unref();
        return emailLog;
      }

      await this.prisma.emailLog.update({
        where: { id: emailLog.id },
        data: {
          status: EmailStatus.FAILED,
          errorMessage: err.message,
          retryCount: this.maxRetries,
        },
      });
      throw err;
    }
  }

  async processEmail(emailLog: EmailLog): Promise<EmailLog> {
    // Double-check suppression
    const recipientLower = emailLog.recipient.toLowerCase();
    const isSuppressed = await this.prisma.emailSuppression.findUnique({
      where: { email: recipientLower },
    });

    if (isSuppressed) {
      await this.prisma.emailLog.update({
        where: { id: emailLog.id },
        data: { status: EmailStatus.REJECTED, errorMessage: 'Recipient is suppressed' },
      });
      return emailLog;
    }

    await this.prisma.emailLog.update({
      where: { id: emailLog.id },
      data: { status: EmailStatus.SENDING },
    });

    try {
      const html = this.renderTemplate(emailLog.templateName || 'verification', emailLog);
      const trackingPixel = `<img src="${process.env.APP_URL || 'http://localhost:3000'}/api/v1/email/track/open/${emailLog.id}" width="1" height="1" alt="" />`;
      const htmlWithTracking = html + trackingPixel;

      await this.mailerService.sendMail({
        to: emailLog.recipient,
        subject: emailLog.subject,
        html: htmlWithTracking,
        from: process.env.MAIL_FROM,
      });

      await this.prisma.emailLog.update({
        where: { id: emailLog.id },
        data: { status: EmailStatus.SENT, sentAt: new Date() },
      });

      this.logger.debug(`Email ${emailLog.id} sent successfully to ${emailLog.recipient}`);
      return emailLog;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      const isPermanent = this.isPermanentFailure(err);
      const newStatus = isPermanent ? EmailStatus.REJECTED : EmailStatus.FAILED;

      await this.prisma.emailLog.update({
        where: { id: emailLog.id },
        data: { status: newStatus, errorMessage: err.message },
      });

      if (isPermanent) {
        await this.addToSuppression(recipientLower, 'BOUNCE', { error: err.message, emailLogId: emailLog.id });
      }

      throw err;
    }
  }

  private async sendEmailById(emailLogId: number): Promise<void> {
    const emailLog = await this.prisma.emailLog.findUnique({ where: { id: emailLogId } });

    if (!emailLog) {
      this.logger.error(`Email log ${emailLogId} not found for retry`);
      return;
    }

    if (emailLog.retryCount >= this.maxRetries) {
      this.logger.error(`Max retries reached for email ${emailLogId}`);
      return;
    }

    try {
      await this.processEmail(emailLog);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Retry failed for email ${emailLogId}: ${err.message}`);

      const nextRetryCount = emailLog.retryCount + 1;
      if (nextRetryCount < this.maxRetries) {
        const delay = this.retryDelays[nextRetryCount] || 60000;
        await this.prisma.emailLog.update({
          where: { id: emailLogId },
          data: {
            retryCount: nextRetryCount,
            nextRetryAt: new Date(Date.now() + delay),
            errorMessage: err.message,
          },
        });
        setTimeout(() => this.sendEmailById(emailLogId), delay).unref();
      } else {
        await this.prisma.emailLog.update({
          where: { id: emailLogId },
          data: { status: EmailStatus.FAILED, retryCount: nextRetryCount, errorMessage: err.message },
        });
      }
    }
  }

  private async checkSuppression(email: string): Promise<boolean> {
    const record = await this.prisma.emailSuppression.findUnique({
      where: { email: email.toLowerCase() },
    });
    return !!record;
  }

  private async addToSuppression(email: string, reason: 'BOUNCE' | 'COMPLAINT' | 'UNSUBSCRIBE' | 'MANUAL', details?: Record<string, unknown>): Promise<void> {
    try {
      await this.prisma.emailSuppression.upsert({
        where: { email: email.toLowerCase() },
        update: { reason, details: details as any },
        create: { email: email.toLowerCase(), reason, details: details as any },
      });
      this.logger.warn(`Added ${email} to suppression list (reason: ${reason})`);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to add to suppression list: ${err.message}`);
    }
  }

  private async updateRateLimit(recipient: string): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.rateLimitWindow);

    const existing = await this.prisma.emailRateLimit.findUnique({
      where: { recipient },
    });

    if (existing && existing.windowStart < windowStart) {
      await this.prisma.emailRateLimit.update({
        where: { recipient },
        data: { count: 1, windowStart: now },
      });
    } else if (existing) {
      await this.prisma.emailRateLimit.update({
        where: { recipient },
        data: { count: { increment: 1 } },
      });
    } else {
      await this.prisma.emailRateLimit.create({
        data: { recipient, count: 1, windowStart: now },
      });
    }
  }

  private renderTemplate(templateName: string, emailLog: EmailLog): string {
    const payload = emailLog.payload as Record<string, unknown>;

    switch (templateName) {
      case 'welcome':
        return this.getWelcomeTemplate(payload);
      case 'password-reset':
        return this.getPasswordResetTemplate(payload);
      case 'notification':
        return this.getNotificationTemplate(payload);
      case 'account-locked':
        return this.getAccountLockedTemplate(payload);
      default:
        return this.getVerificationTemplate(emailLog);
    }
  }

  private isPermanentFailure(error: Error): boolean {
    const permanentCodes = [550, 551, 553, 554];
    return permanentCodes.some(code => error.message?.includes(String(code)));
  }

  // Tracking methods
  async markAsOpened(emailLogId: number): Promise<void> {
    await this.prisma.emailLog.update({
      where: { id: emailLogId },
      data: { opened: true, openedAt: new Date() },
    });
  }

  async markAsClicked(emailLogId: number): Promise<void> {
    await this.prisma.emailLog.update({
      where: { id: emailLogId },
      data: { clicked: true, clickedAt: new Date() },
    });
  }

  // Management methods
  async getEmailLogs(limit = 50, offset = 0) {
    return this.prisma.emailLog.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, role: true, name: true } } },
    });
  }

  async getEmailStats() {
    const counts = await this.prisma.emailLog.groupBy({ by: ['status'], _count: { id: true } });
    const byType = await this.prisma.emailLog.groupBy({ by: ['type'], _count: { id: true } });
    const recent24h = await this.prisma.emailLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    return { byStatus: counts, byType, last24Hours: recent24h };
  }

  async retryEmail(emailLogId: number): Promise<EmailLog> {
    const emailLog = await this.prisma.emailLog.findUnique({ where: { id: emailLogId } });

    if (!emailLog) {
      throw new Error('Email log not found');
    }

    if (emailLog.retryCount >= this.maxRetries) {
      throw new Error('Max retries exceeded for this email');
    }

    await this.prisma.emailLog.update({
      where: { id: emailLogId },
      data: { retryCount: 0, nextRetryAt: null, status: EmailStatus.QUEUED, errorMessage: null },
    });

    return this.processEmail(emailLog);
  }

  async getSuppressionList(limit = 50, offset = 0) {
    return this.prisma.emailSuppression.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeSuppression(email: string): Promise<{ count: number }> {
    return this.prisma.emailSuppression.deleteMany({ where: { email: email.toLowerCase() } });
  }

  async unsubscribe(email: string, reason: 'UNSUBSCRIBE' | 'MANUAL' = 'UNSUBSCRIBE') {
    await this.addToSuppression(email, reason, { unsubscribedAt: new Date().toISOString() });
    return { success: true, message: 'Successfully unsubscribed' };
  }

  async resubscribe(email: string) {
    const result = await this.prisma.emailSuppression.deleteMany({ where: { email: email.toLowerCase() } });
    return result.count > 0 ? { success: true } : { success: false, message: 'Email not found in suppression list' };
  }

  // Templates (inline for simplicity - can be moved to Handlebars files)
  private getVerificationTemplate(emailLog: EmailLog): string {
    const { verificationUrl, name } = emailLog.payload as { verificationUrl: string; name?: string };
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your Zibhoz account</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; margin: 0;">
  <div style="background: white; border-radius: 24px; padding: 48px; max-width: 600px; margin: 0 auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
    <div style="font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 32px;">Zibhoz</div>
    <h1 style="color: #1a202c; font-size: 28px; margin-bottom: 16px; text-align: center;">Verify your email address</h1>
    <div style="background: #f7fafc; padding: 16px; border-radius: 12px; margin: 24px 0; text-align: center;">
      <p>Hi <span style="color: #667eea; font-weight: 600;">${name || 'there'}</span>,</p>
    </div>
    <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Welcome to Zibhoz! We're excited to have you on board. To get started, please verify your email address by clicking the button below.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 48px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">Verify Email Address</a>
    </div>
    <div style="background: #fffaf0; border-left: 4px solid #ed8936; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0; font-size: 14px; color: #744210;">
      <strong>Security note:</strong> This link will expire in 24 hours. If you didn't request this verification, you can safely ignore this email.
    </div>
    <p style="font-size: 14px; color: #718096; text-align: center;">Or copy and paste this link:<br><span style="color: #667eea;">${verificationUrl}</span></p>
    <div style="text-align: center; color: #718096; font-size: 14px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
      <p>Need help? Contact our support team at <a href="mailto:support@zibhoz.com" style="color: #667eea;">support@zibhoz.com</a></p>
      <p><strong>The Zibhoz Team</strong></p>
    </div>
  </div>
</body>
</html>`;
  }

  private getWelcomeTemplate(payload: Record<string, unknown>): string {
    const { name, email, loginUrl } = payload;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Zibhoz!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #10b981 0%, #059669 100%); min-height: 100vh; padding: 20px; margin: 0;">
  <div style="background: white; border-radius: 24px; padding: 48px; max-width: 600px; margin: 0 auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
    <div style="font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #10b981 0%, #059669 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 32px;">Zibhoz</div>
    <h1 style="color: #1a202c; font-size: 28px; margin-bottom: 16px; text-align: center;">Welcome to Zibhoz! 🎉</h1>
    <div style="background: #f0fdf4; padding: 16px; border-radius: 12px; margin: 24px 0; text-align: center;">
      <p>Hi <span style="color: #059669; font-weight: 600;">${name || 'there'}</span>,</p>
    </div>
    <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Your account has been successfully created! You're now part of our learning community. Get ready to explore amazing content and connect with fellow learners.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 16px 48px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);">Start Exploring</a>
    </div>
    <div style="background: #fefce8; border-left: 4px solid #eab308; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0; font-size: 14px; color: #713f12;">
      <strong>Tip:</strong> Complete your profile to get personalized recommendations and track your learning progress.
    </div>
    <div style="text-align: center; color: #718096; font-size: 14px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
      <p>Need help? Contact our support team at <a href="mailto:support@zibhoz.com" style="color: #059669;">support@zibhoz.com</a></p>
      <p><strong>The Zibhoz Team</strong></p>
    </div>
  </div>
</body>
</html>`;
  }

  private getPasswordResetTemplate(payload: Record<string, unknown>): string {
    const { resetUrl, name } = payload;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your Zibhoz password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); min-height: 100vh; padding: 20px; margin: 0;">
  <div style="background: white; border-radius: 24px; padding: 48px; max-width: 600px; margin: 0 auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
    <div style="font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 32px;">Zibhoz</div>
    <h1 style="color: #1a202c; font-size: 28px; margin-bottom: 16px; text-align: center;">Password Reset Request</h1>
    <div style="background: #fffbeb; padding: 16px; border-radius: 12px; margin: 24px 0; text-align: center;">
      <p>Hi <span style="color: #d97706; font-weight: 600;">${name || 'there'}</span>,</p>
    </div>
    <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">We received a request to reset your password. Click the button below to create a new password. If you didn't request this, you can safely ignore this email.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 16px 48px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);">Reset Password</a>
    </div>
    <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0; font-size: 14px; color: #7f1d1d;">
      <strong>Security alert:</strong> This link will expire in 1 hour. Never share this link with anyone.
    </div>
    <p style="font-size: 14px; color: #718096; text-align: center;">Or copy and paste this link:<br><span style="color: #f59e0b;">${resetUrl}</span></p>
    <div style="text-align: center; color: #718096; font-size: 14px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
      <p>Need help? Contact our support team at <a href="mailto:support@zibhoz.com" style="color: #d97706;">support@zibhoz.com</a></p>
      <p><strong>The Zibhoz Team</strong></p>
    </div>
  </div>
</body>
</html>`;
  }

  private getNotificationTemplate(payload: Record<string, unknown>): string {
    const { title, message, actionUrl } = payload;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); min-height: 100vh; padding: 20px; margin: 0;">
  <div style="background: white; border-radius: 24px; padding: 48px; max-width: 600px; margin: 0 auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
    <div style="font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 32px;">Zibhoz</div>
    <h1 style="color: #1a202c; font-size: 28px; margin-bottom: 16px; text-align: center;">${title}</h1>
    <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">${message}</p>
    ${actionUrl ? `<div style="text-align: center; margin: 32px 0;"><a href="${actionUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 16px 48px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);">View Details</a></div>` : ''}
    <div style="text-align: center; color: #718096; font-size: 14px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
      <p>Need help? Contact our support team at <a href="mailto:support@zibhoz.com" style="color: #3b82f6;">support@zibhoz.com</a></p>
      <p><strong>The Zibhoz Team</strong></p>
    </div>
  </div>
</body>
</html>`;
  }

  private getAccountLockedTemplate(payload: Record<string, unknown>): string {
    const { name, supportUrl } = payload;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Locked</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); min-height: 100vh; padding: 20px; margin: 0;">
  <div style="background: white; border-radius: 24px; padding: 48px; max-width: 600px; margin: 0 auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
    <div style="font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 32px;">Zibhoz</div>
    <h1 style="color: #1a202c; font-size: 28px; margin-bottom: 16px; text-align: center;">🔒 Account Locked</h1>
    <div style="background: #fef2f2; padding: 16px; border-radius: 12px; margin: 24px 0; text-align: center;">
      <p>Hi <span style="color: #dc2626; font-weight: 600;">${name || 'there'}</span>,</p>
    </div>
    <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Your account has been temporarily locked due to multiple failed login attempts. This is a security measure to protect your account.</p>
    <div style="background: #fff1f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; color: #7f1d1d;"><strong>What happens next?</strong></p>
      <ul style="color: #7f1d1d; margin: 8px 0 0 0; padding-left: 20px;">
        <li>Your account will be automatically unlocked in 24 hours</li>
        <li>You can contact support for immediate assistance</li>
        <li>If you didn't attempt to log in, please contact support immediately</li>
      </ul>
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${supportUrl}" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 16px 48px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);">Contact Support</a>
    </div>
    <div style="text-align: center; color: #718096; font-size: 14px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
      <p>Need help? Contact our support team at <a href="mailto:support@zibhoz.com" style="color: #dc2626;">support@zibhoz.com</a></p>
      <p><strong>The Zibhoz Team</strong></p>
    </div>
  </div>
</body>
</html>`;
  }
}
