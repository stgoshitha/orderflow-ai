import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { PasswordService } from '../auth/password.service';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

async function bootstrapAdmin(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error('An interactive terminal is required.');
  }

  const app = await NestFactory.createApplicationContext(
    AppModule,
    { logger: ['error', 'warn'] },
  );

  try {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error(
        'Admin bootstrap is restricted to development.',
      );
    }

    const prisma = app.get(PrismaService);
    const passwordService = app.get(PasswordService);

    const existingAdmin = await prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });

    if (existingAdmin) {
      throw new Error(
        'An Admin already exists. Bootstrap is disabled.',
      );
    }

    // Dynamic import supports ESM-based CLI prompts.
    const { input, password } = await import(
      '@inquirer/prompts'
    );

    const fullName = (
      await input({
        message: 'Admin full name:',
        validate: (value) =>
          (value.trim().length >= 2 &&
            value.trim().length <= 100) ||
          'Name must contain 2 to 100 characters.',
      })
    ).trim();

    const email = (
      await input({
        message: 'Admin email:',
        validate: (value) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            value.trim(),
          ) || 'Enter a valid email address.',
      })
    ).trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new Error('Email is already registered.');
    }

    const plainPassword = await password({
      message: 'Admin password:',
      mask: '*',
      toggleMask: false,
      validate: (value) =>
        (value.length >= 12 && value.length <= 128) ||
        'Use a password of 12 to 128 characters.',
    });

    const confirmation = await password({
      message: 'Confirm password:',
      mask: '*',
      toggleMask: false,
    });

    if (plainPassword !== confirmation) {
      throw new Error('Passwords do not match.');
    }

    const passwordHash =
      await passwordService.hash(plainPassword);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role: UserRole.ADMIN,
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    console.log('Admin created successfully.');
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
  } finally {
    await app.close();
  }
}

void bootstrapAdmin().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown bootstrap error';

  console.error(`Bootstrap failed: ${message}`);
  process.exitCode = 1;
});
