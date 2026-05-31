import { sign, verify } from 'jsonwebtoken';
import { JWT_SECRET, TOKEN_EXPIRY } from '../../shared/constants';

export interface TokenPayload {
  userId: number;
  username: string;
  role: string;
}

export class TokenService {
  /** 生成 JWT Token */
  static generate(payload: TokenPayload): { token: string; expiresAt: number } {
    const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY;
    const token = sign({ ...payload, exp: expiresAt }, JWT_SECRET);
    return { token, expiresAt };
  }

  /** 验证 JWT Token */
  static verify(token: string): TokenPayload | null {
    try {
      return verify(token, JWT_SECRET) as TokenPayload;
    } catch {
      return null;
    }
  }
}
