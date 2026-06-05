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

  /** 请求重置密码（发送找回验证码） */
  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    // TODO: 实现逻辑
    // 1. 校验邮箱格式
    // 2. 通过 this.store.users.findByEmail(email) 查找用户
    // 3. 若用户不存在返回错误"该邮箱未绑定账号"
    // 4. 调用 this.verifyCodeService.sendCode(email, 'reset') 发送验证码
    // 5. 返回 sendCode 的结果
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: '邮箱格式不正确' };
    }
    const userRecord = this.store.users.findByEmail(email);
    if (!userRecord) {
      return { success: false, error: '该邮箱没有绑定账号，请确认邮箱是否正确' };
    }
    const code = await this.verifyCodeService.sendCode(email, 'reset');
    if (!code.success) {
      return { success: false, error: code.error };
    }
    return { success: true };
  }

  /** 重置密码 */
  async resetPassword(email: string, verifyCode: string, newPassword: string): Promise<AuthResult> {
    // TODO: 实现逻辑
    // 1. 校验新密码格式（6-32位）
    // 2. 通过 this.store.users.findByEmail(email) 查找用户
    // 3. 若用户不存在返回错误
    // 4. 调用 this.verifyCodeService.verifyCode(email, verifyCode, 'reset') 校验验证码
    // 5. 若验证失败返回错误
    // 6. 使用 PasswordService.hash(newPassword) 生成新密码哈希
    // 7. 调用 this.store.users.updatePassword(user.id, newPasswordHash) 更新密码
    // 8. 生成新的 JWT Token（可选：强制下线其他设备）
    // 9. 返回包含 user 和 token 的 AuthResult
    if(newPassword.length < 6 || newPassword.length > 32 ){
      return { success : false , error : '密码长度必须在6-32位之内！'}
    }
    const user = this.store.users.findByEmail(email);
    if(user == undefined){
      return { success : false, error : '用户不存在！'};
    }
    const verifyResult = this.verifyCodeService.verifyCode(email, verifyCode, 'reset');
    if (!verifyResult.success) {
      return { success: false, error: verifyResult.error };
    }
    const newHash = await PasswordService.hash(newPassword);
    const password = this.store.users.updatePassword(user.id, newHash);
    if(password == false) return {success : false, error : '本地储存密码未更新成功！'}

    const {token, expiresAt} = TokenService.generate({
      userId : user.id,
      username : user.username,
      role : user.role
    })
    return { success: true, user,token,expiresAt};
  }
}
