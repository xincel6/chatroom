import { hash, compare } from 'bcryptjs';
import { BCRYPT_ROUNDS } from '../../shared/constants';

export class PasswordService {
  /** 对明文密码进行哈希 */
  static async hash(password: string): Promise<string> {
    return hash(password, BCRYPT_ROUNDS);
  }

  /** 比对明文密码和哈希值 */
  static async compare(password: string, hash: string): Promise<boolean> {
    return compare(password, hash);
  }
}
