import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PasswordModule } from './password.module';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AuthController } from './auth.controller';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [PrismaModule, PasswordModule],
  providers: [AuthService, SessionAuthGuard, RolesGuard],
  controllers: [AuthController],
  exports: [AuthService, SessionAuthGuard, RolesGuard],
})
export class AuthModule {}
