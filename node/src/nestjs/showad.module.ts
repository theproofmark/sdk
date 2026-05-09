/**
 * NestJS module wrapping the ShowAd middleware and guard.
 *
 * Usage:
 *
 *   @Module({
 *     imports: [
 *       ShowAdModule.forRoot({
 *         creatorHash: process.env.SHOWAD_CREATOR_HASH!,
 *         apiKey: process.env.SHOWAD_API_KEY!,
 *         redirectSecret: process.env.SHOWAD_REDIRECT_SECRET!,
 *       }, { protectedPaths: ['/premium/*'] }),
 *     ],
 *   })
 *   export class AppModule implements NestModule {
 *     configure(consumer: MiddlewareConsumer) {
 *       consumer.apply(ShowAdMiddleware).forRoutes('*');
 *     }
 *   }
 */

import { DynamicModule, Module } from '@nestjs/common';
import type { ProtectMiddlewareOptions, ShowAdConfig } from '../types';
import { ShowAdMiddleware } from './showad.middleware';
import { ShowAdGuard } from './showad.guard';
import { SHOWAD_CONFIG, SHOWAD_OPTIONS } from './tokens';

@Module({})
export class ShowAdModule {
  static forRoot(
    config: ShowAdConfig,
    options: ProtectMiddlewareOptions = {}
  ): DynamicModule {
    return {
      module: ShowAdModule,
      global: true,
      providers: [
        { provide: SHOWAD_CONFIG, useValue: config },
        { provide: SHOWAD_OPTIONS, useValue: options },
        ShowAdMiddleware,
        ShowAdGuard,
      ],
      exports: [SHOWAD_CONFIG, SHOWAD_OPTIONS, ShowAdMiddleware, ShowAdGuard],
    };
  }
}
