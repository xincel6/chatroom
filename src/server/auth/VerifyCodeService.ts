import { EmailService } from '../server/mail';

interface VerifyCodeEntry {
  code: string;
  email: string;
  action: 'register' | 'reset';
  expiresAt: number; // Unix 秒级时间戳
}

export class VerifyCodeService {
  private store = new Map<string, VerifyCodeEntry>(); // key = email
  private emailService = new EmailService();
  private readonly CODE_TTL_MS = 5 * 60 * 1000; // 5 分钟

  /** 生成 6 位数字验证码 */
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /** 发送验证码 */
  async sendCode(email: string, action: 'register' | 'reset'): Promise<{ success: boolean; error?: string }> {
    // 简单邮箱格式校验
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: '邮箱格式不正确' };
    }

    const code = this.generateCode();
    const expiresAt = Math.floor((Date.now() + this.CODE_TTL_MS) / 1000);

    try {
      await this.emailService.sendVerifyCode(email, code);
      this.store.set(email, { code, email, action, expiresAt });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `邮件发送失败: ${err.message}` };
    }
  }

  /** 验证验证码 */
  verifyCode(email: string, code: string, action: 'register' | 'reset'): { success: boolean; error?: string } {
    const entry = this.store.get(email);
    if (!entry) {
      return { success: false, error: '验证码不存在，请先获取验证码' };
    }
    if (entry.action !== action) {
      return { success: false, error: '验证码类型不匹配' };
    }
    if (Math.floor(Date.now() / 1000) > entry.expiresAt) {
      this.store.delete(email);
      return { success: false, error: '验证码已过期，请重新获取' };
    }
    if (entry.code !== code) {
      return { success: false, error: '验证码错误' };
    }

    // 验证成功后删除，防止重复使用
    this.store.delete(email);
    return { success: true };
  }

  /** 清理过期验证码（可由外部定时调用） */
  cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [email, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(email);
      }
    }
  }
}
