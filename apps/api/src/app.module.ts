import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { PasswordModule } from './auth/password.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: z.object({
        NODE_ENV: z
          .enum(['development', 'test', 'production'])
          .default('development'),

        PORT: z.coerce
          .number()
          .int()
          .min(1)
          .max(65535)
          .default(4000),

        DATABASE_URL: z.url(),
      }),
    }),
    PrismaModule,
    HealthModule,
    PasswordModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
