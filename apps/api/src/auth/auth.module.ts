import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PasswordModule } from './password.module';
import { AuthService } from './auth.service';

@Module({
  imports: [PrismaModule, PasswordModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
