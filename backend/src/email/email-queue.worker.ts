import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { EmailStatus } from '@prisma/client';
import { interval, Subscription } from 'rxjs';

@Injectable()
export class EmailQueueWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueWorker.name);
  private workerInterval!: Subscription;
  private readonly batchSize = 50;
  private readonly pollInterval = 5000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    this.logger.log('Starting email queue worker...');
    this.workerInterval = interval(this.pollInterval).subscribe(() => {
      this.processQueue().catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Email queue worker error: ${err.message}`,
          err.stack,
        );
      });
    });
  }

  onModuleDestroy() {
    this.logger.log('Stopping email queue worker...');
    if (this.workerInterval) {
      this.workerInterval.unsubscribe();
    }
  }

  private async processQueue(): Promise<void> {
    const now = new Date();

    const queuedEmails = await this.prisma.emailLog.findMany({
      where: {
        status: EmailStatus.QUEUED,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      take: this.batchSize,
      orderBy: { createdAt: 'asc' },
    });

    if (queuedEmails.length === 0) {
      return;
    }

    this.logger.debug(`Processing ${queuedEmails.length} queued emails`);

    const concurrencyLimit = 5;
    for (let i = 0; i < queuedEmails.length; i += concurrencyLimit) {
      const batch = queuedEmails.slice(i, i + concurrencyLimit);
      await Promise.allSettled(
        batch.map((emailLog) => this.emailService.processEmail(emailLog)),
      );
    }
  }
}
