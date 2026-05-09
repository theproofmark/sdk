/**
 * NestJS guard that validates ShowAd verification on inbound requests.
 *
 * The guard does NOT perform redirects (guards return boolean). Use the
 * middleware (`ShowAdMiddleware`) for redirect-based gating; use the guard
 * for API endpoints that should respond 401 when unverified.
 */

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifyExpressRequest } from '../express';
import type { ShowAdConfig } from '../types';
import { SHOWAD_CONFIG } from './tokens';

@Injectable()
export class ShowAdGuard implements CanActivate {
  constructor(@Inject(SHOWAD_CONFIG) private readonly config: ShowAdConfig) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const result = await verifyExpressRequest(req as never, this.config);
    if (!result.verified) {
      throw new UnauthorizedException({
        message: 'ShowAd verification required',
        reason: result.reason,
      });
    }
    return true;
  }
}
