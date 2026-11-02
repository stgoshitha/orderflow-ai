import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(
    storedHash: string,
    plainPassword: string,
  ): Promise<boolean> {
    return argon2.verify(storedHash, plainPassword);
  }
}
