import { StoreManager } from '../store/StoreManager';
import { PasswordService } from './PasswordService';
import { TokenService, TokenPayload } from './TokenService';
import { VerifyCodeService } from './VerifyCodeService';

export interface AuthResult {
  success: boolean;
  error?: string;
  user?: { id: number; username: string; nickname: string; role: string; email: string };
  token?: string;
  expiresAt?: number;
}

export class AuthManager {
  private store = StoreManager.getInstance();
  private verifyCodeService = new VerifyCodeService();

  getVerifyCodeService(): VerifyCodeService {
    return this.verifyCodeService;
  }

  /** 用户注册 */
  async register(
    username: string,
    password: string,
    nickname: string,
    email: string,
    verifyCode: string
  ): Promise<AuthResult> {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return { success: false, error: '用户名需 3-20 位字母/数字/下划线' };
    }
    if (password.length < 6 || password.length > 32) {
      return { success: false, error: '密码需 6-32 位' };
    }
    if (!nickname || nickname.length > 20) {
      return { success: false, error: '昵称需 1-20 位' };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: '邮箱格式不正确' };
    }
    if (this.store.users.usernameExists(username)) {
      return { success: false, error: '用户名已被注册' };
    }
    if (this.store.users.nicknameExists(nickname)) {
      return { success: false, error: '昵称已被占用' };
    }
    if (this.store.users.emailExists(email)) {
      return { success: false, error: '邮箱已被注册' };
    }

    // 验证邮箱验证码
    const verifyResult = this.verifyCodeService.verifyCode(email, verifyCode, 'register');
    if (!verifyResult.success) {
      return { success: false, error: verifyResult.error };
    }

    const passwordHash = await PasswordService.hash(password);
    // 如果系统中还没有任何 ADMIN，第一个注册用户自动成为 ADMIN
    const hasAdmin = this.store.users.getAll().some(u => u.role === 'ADMIN');
    const role = hasAdmin ? 'MEMBER' : 'ADMIN';
    const user = this.store.users.create({
      username, passwordHash, nickname, email,
      role,
      lastLoginAt: null,
      metadata: { messageCount: 0, totalOnlineMinutes: 0 },
    });
    const { token, expiresAt } = TokenService.generate({
      userId: user.id, username: user.username, role: user.role,
    });

    return { success: true, user, token, expiresAt };
  }

  /** 用户登录 */
  async login(username: string, password: string): Promise<AuthResult> {
    const user = this.store.users.findByUsername(username);
    if (!user) {
      return { success: false, error: '用户名或密码错误' };
    }
    const valid = await PasswordService.compare(password, user.passwordHash);
    if (!valid) {
      return { success: false, error: '用户名或密码错误' };
    }

    this.store.users.updateLastLogin(user.id);
    const { token, expiresAt } = TokenService.generate({
      userId: user.id, username: user.username, role: user.role,
    });

    return { success: true, user, token, expiresAt };
  }

  /** Token 验证 */
  verifyToken(token: string): TokenPayload | null {
    return TokenService.verify(token);
  }
}
