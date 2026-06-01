import { createTransport, Transporter } from 'nodemailer';

export class EmailService {
    private transporter: Transporter;

    constructor() {
        // 用 QQ 邮箱 SMTP
        this.transporter = createTransport({
            host: 'smtp.qq.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.QQ_EMAIL_USER,        // 你的 QQ 邮箱
                pass: process.env.QQ_EMAIL_PASS,        // QQ 邮箱授权码（不是登录密码！）
            },
        });
    }

    /** 发送验证码邮件 */
    async sendVerifyCode(to: string, code: string): Promise<void> {
        await this.transporter.sendMail({
            from: `"聊天室注册" <${process.env.QQ_EMAIL_USER}>`,
            to,
            subject: '您的注册验证码',
            html: `<p>验证码：<strong>${code}</strong></p><p>5 分钟内有效，请勿泄露。</p>`,
        });
    }
}