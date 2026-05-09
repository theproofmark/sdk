/**
 * NestJS middleware that wraps the Express adapter.
 *
 * Use it via `MiddlewareConsumer.apply(...)` or attach via the module's
 * `forRoot()` configuration.
 */

import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import {
  createShowAdMiddleware,
  type ExpressRequestHandler,
} from '../express';
import type { ProtectMiddlewareOptions, ShowAdConfig } from '../types';
import { SHOWAD_CONFIG, SHOWAD_OPTIONS } from './tokens';

@Injectable()
export class ShowAdMiddleware implements NestMiddleware {
  private readonly handler: ExpressRequestHandler;

  constructor(
    @Inject(SHOWAD_CONFIG) config: ShowAdConfig,
    @Inject(SHOWAD_OPTIONS) options: ProtectMiddlewareOptions
  ) {
    this.handler = createShowAdMiddleware(config, options);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    this.handler(req as unknown as Parameters<ExpressRequestHandler>[0],
      res as unknown as Parameters<ExpressRequestHandler>[1],
      next);
  }
}
