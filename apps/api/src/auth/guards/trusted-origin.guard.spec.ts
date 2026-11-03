import {
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TrustedOriginGuard } from './trusted-origin.guard';

describe('TrustedOriginGuard', () => {
  const config = {
    getOrThrow: jest.fn().mockReturnValue(
      'http://localhost:3000',
    ),
  };

  const guard = new TrustedOriginGuard(
    config as unknown as ConfigService,
  );

  function createContext(
    method: string,
    headers: Record<string, string> = {},
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, headers }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows a trusted frontend origin', () => {
    const context = createContext('POST', {
      origin: 'http://localhost:3000',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects an untrusted origin', () => {
    const context = createContext('POST', {
      origin: 'https://malicious.example',
    });

    expect(() => guard.canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('rejects POST requests without origin evidence', () => {
    const context = createContext('POST');

    expect(() => guard.canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('allows safe GET requests', () => {
    const context = createContext('GET');

    expect(guard.canActivate(context)).toBe(true);
  });
});
