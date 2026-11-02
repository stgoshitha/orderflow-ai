import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();
  const plainPassword = 'Secure-Test-Password-2026!';

  it('generates an Argon2id password hash', async () => {
    const hash = await service.hash(plainPassword);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toBe(plainPassword);
  });

  it('verifies a correct password', async () => {
    const hash = await service.hash(plainPassword);

    await expect(
      service.verify(hash, plainPassword),
    ).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash(plainPassword);

    await expect(
      service.verify(hash, 'Incorrect-Password'),
    ).resolves.toBe(false);
  });

  it('generates different hashes for the same password', async () => {
    const firstHash = await service.hash(plainPassword);
    const secondHash = await service.hash(plainPassword);

    expect(firstHash).not.toBe(secondHash);
  });
});
