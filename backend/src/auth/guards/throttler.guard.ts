import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard as NestThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ThrottlerGuard extends NestThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const ip = req.ip;
    const route = req.route?.path || req.url || 'unknown';
    return Promise.resolve(`${ip}:${route}`);
  }
}
