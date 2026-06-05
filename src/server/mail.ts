import { createTransport, Transporter } from 'nodemailer';

export class EmailService {
    private transporter: Transporter;

    constructor() {
        const emailHost = process.env.CHAT_EMAIL_HOST || '';
        // CHAT_EMAIL_HOST 可能是邮箱地址（如 xxx@qq.com），也可能是 SMTP 服务器地址
        const isEmail = emailHost.includes('@');
        const authUser = isEmail ? emailHost : (process.env.CHAT_EMAIL_USER || '');
        const smtpHost = isEmail ? 'smtp.qq.com' : (emailHost || 'smtp.qq.com');
        const pass = process.env.CHAT_EMAIL_PASS || '';
        const secure = process.env.CHAT_EMAIL_SECURE !== 'false';
        const port = secure ? 465 : 587;

        // 用 QQ 邮箱 SMTP
        this.transporter = createTransport({
            host: smtpHost,
            port,
            secure,
            auth: {
                user: authUser,  // 发件人邮箱
                pass,            // 邮箱授权码（不是登录密码！）
            },
        });
    }

    /** 发送验证码邮件 */
    async sendVerifyCode(to: string, code: string): Promise<void> {
        const fromEmail = process.env.CHAT_EMAIL_HOST || 'noreply@example.com';
        await this.transporter.sendMail({
            from: `"聊天室注册" <${fromEmail}>`,
            to,
            subject: '您的注册验证码',
            html: `<p>验证码：<strong>${code}</strong></p><p>5 分钟内有效，请勿泄露。</p>`,
        });
    }
}
