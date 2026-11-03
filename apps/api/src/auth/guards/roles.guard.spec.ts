import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UserRole } from '../../generated/prisma/enums';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

class TestController {
  @Roles(UserRole.ADMIN)
  adminOnly() {}

  @Roles(UserRole.ADMIN, UserRole.STAFF)
  adminOrStaff() {}

  @Roles()
  emptyRoles() {}

  noRoleRequirement() {}
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  function createContext(
    method: keyof TestController,
    role?: UserRole,
  ): ExecutionContext {
    return {
      getHandler: () => TestController.prototype[method],
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({
          auth: role
            ? { user: { role } }
            : undefined,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows Admin access to Admin-only routes', () => {
    const context = createContext(
      'adminOnly',
      UserRole.ADMIN,
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies Staff access to Admin-only routes', () => {
    const context = createContext(
      'adminOnly',
      UserRole.STAFF,
    );

    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows Staff when both roles are permitted', () => {
    const context = createContext(
      'adminOrStaff',
      UserRole.STAFF,
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies unauthenticated access to role-restricted routes', () => {
    const context = createContext('adminOnly');

    expect(guard.canActivate(context)).toBe(false);
  });

  it('denies an explicitly empty role list', () => {
    const context = createContext(
      'emptyRoles',
      UserRole.ADMIN,
    );

    expect(guard.canActivate(context)).toBe(false);
  });

  it('adds no role restriction when metadata is absent', () => {
    const context = createContext(
      'noRoleRequirement',
      UserRole.STAFF,
    );

    expect(guard.canActivate(context)).toBe(true);
  });
});
