import { createConnection, Socket } from 'net';
import { execSync } from 'child_process';
import {
    BaseMessage, MessageType, AuthMessage, ChatMessage, WhisperMessage, JoinMessage,
    RegisterMessage, LoginMessage, HistoryMessage,
    RegisterOkMessage, RegisterFailMessage, LoginOkMessage, LoginFailMessage,
    TokenOkMessage, TokenFailMessage, HistoryDataMessage,
    SendVerifyMessage, VerifyOkMessage,
    ResetPasswordMessage, ResetPasswordOkMessage, ResetPasswordFailMessage,
    ListMessage, UserListMessage
} from '../shared/protocol';
import { v4 as uuidv4 } from 'uuid';

type AuthMode =
    | 'choice'
    | 'login_user' | 'login_pass'
    | 'register_email' | 'register_code' | 'register_user' | 'register_pass' | 'register_nick'
    | 'guest_nick'
    | 'forgot_email' | 'forgot_code' | 'forgot_pass'
    | 'waiting'
    | 'chat';

export class ChatClient {
    private socket: Socket;
    private nickname: string = '';
    private currentRoom: string = 'Lobby';
    private buffer: string = '';
    private chatStarted: boolean = false;
    private token: string = '';
    private lastHistoryId: number | null = null;
    private pendingEmail: string = '';
    private authMode: AuthMode = 'choice';

    private tempUsername: string = '';
    private tempPassword: string = '';
    private tempCode: string = '';

    /** 输入缓冲区（手动管理，绕过 readline/blessed 的 Windows 兼容问题） */
    private inputBuffer: string = '';
    /** 是否处于密码输入模式（回显 ***） */
    private passwordMode: boolean = false;
    /** 当前提示符文本 */
    private prompt: string = '> ';
    /** 记录上次回显的显示宽度，用于清除残留 */
    private lastDisplayLen: number = 0;
    /** 防重入标记 */
    private writing: boolean = false;
    private pendingMessages: string[] = [];

    constructor(host: string, port: number) {
        if (process.platform === 'win32') {
            try {
                execSync('chcp 65001', { stdio: 'ignore' });
            } catch {
                // 忽略权限或环境错误
            }
        }

        this.socket = createConnection({ host, port });
        this.setupSocket();
        this.startInput();
    }

    // ==================== 输入处理 ====================

    private startInput(): void {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        let escBuf = '';

        process.stdin.on('data', (data: string) => {
            for (const ch of data) {
                // 处理 ESC 序列（方向键等）
                if (escBuf) {
                    escBuf += ch;
                    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '~') {
                        escBuf = '';
                    }
                    continue;
                }
                if (ch === '\x1b') {
                    escBuf = '\x1b';
                    continue;
                }

                const code = ch.charCodeAt(0);

                // Ctrl+C: 退出
                if (code === 3) {
                    this.socket.end();
                    this.restoreTerminal();
                    process.exit(0);
                }

                // Enter
                if (code === 13) {
                    const value = this.inputBuffer;
                    this.inputBuffer = '';
                    this.lastDisplayLen = 0;
                    process.stdout.write('\n');
                    this.handleInput(value);
                    this.redrawPrompt();
                    continue;
                }

                // Backspace
                if (code === 8 || code === 127) {
                    if (this.inputBuffer.length > 0) {
                        this.inputBuffer = this.inputBuffer.slice(0, -1);
                        this.echoBackspace();
                    }
                    continue;
                }

                // 可打印字符
                if (code >= 32) {
                    this.inputBuffer += ch;
                    this.echoChar(ch);
                }
            }
        });
    }

    private getDisplayBuffer(): string {
        if (this.passwordMode) {
            return '*'.repeat(this.inputBuffer.length);
        }
        return this.inputBuffer;
    }

    private echoChar(ch: string): void {
        if (this.passwordMode) {
            process.stdout.write('*');
        } else {
            process.stdout.write(ch);
        }
        this.lastDisplayLen = this.getDisplayBuffer().length;
    }

    private echoBackspace(): void {
        const currentDisplay = this.getDisplayBuffer();
        if (this.lastDisplayLen > 0 && currentDisplay.length < this.lastDisplayLen) {
            process.stdout.write('\b \b');
        }
        this.lastDisplayLen = currentDisplay.length;
    }

    /** 刷新输入提示行 */
    private redrawPrompt(): void {
        const display = this.getDisplayBuffer();
        // 清除当前行残留
        const clearLen = Math.max(this.lastDisplayLen, display.length);
        process.stdout.write('\r\x1b[K' + this.prompt + display);
        if (display.length < clearLen) {
            process.stdout.write(' '.repeat(clearLen - display.length));
            process.stdout.write('\r\x1b[K' + this.prompt + display);
        }
        this.lastDisplayLen = display.length;
    }

    private setPrompt(prompt: string): void {
        this.prompt = prompt;
        this.redrawPrompt();
    }

    private restoreTerminal(): void {
        process.stdin.setRawMode(false);
        process.stdin.pause();
    }

    // ==================== 消息输出 ====================

    private addMessage(text: string): void {
        if (this.writing) {
            this.pendingMessages.push(text);
            return;
        }
        this.writing = true;

        // 清除当前输入行，打印消息，再重绘输入行
        process.stdout.write('\r\x1b[K');
        const lines = text.split('\n');
        for (const line of lines) {
            process.stdout.write(line + '\n');
        }
        this.redrawPrompt();

        this.writing = false;

        // 排空积压消息
        while (this.pendingMessages.length > 0) {
            const msg = this.pendingMessages.shift()!;
            this.addMessage(msg);
        }
    }

    private addError(text: string): void {
        this.addMessage(`\x1b[31m${text}\x1b[0m`);
    }

    // ==================== 输入分发 ====================

    private handleInput(value: string): void {
        const line = value.trim();
        if (!line) return;

        switch (this.authMode) {
            case 'choice':
                this.handleAuthChoice(line);
                break;

            case 'login_user':
                this.tempUsername = line;
                this.authMode = 'login_pass';
                this.passwordMode = true;
                this.setPrompt('密码: ');
                break;

            case 'login_pass': {
                this.passwordMode = false;
                const login: LoginMessage = {
                    type: MessageType.LOGIN,
                    payload: { username: this.tempUsername.trim(), password: line },
                    timestamp: new Date().toISOString(),
                    sender: '',
                    id: uuidv4()
                };
                this.send(login);
                this.authMode = 'waiting';
                this.setPrompt('');
                this.addMessage('正在登录...');
                break;
            }

            case 'register_email': {
                if (!line) {
                    this.addError('邮箱不能为空');
                    return;
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) {
                    this.addError('邮箱格式不正确');
                    return;
                }
                this.pendingEmail = line;
                const verifyMsg: SendVerifyMessage = {
                    type: MessageType.SEND_VERIFY,
                    payload: { action: 'register', email: line },
                    timestamp: new Date().toISOString(),
                    sender: '',
                    id: uuidv4()
                };
                this.send(verifyMsg);
                this.authMode = 'waiting';
                this.setPrompt('');
                this.addMessage('验证码已发送，请检查邮箱...');
                break;
            }

            case 'register_code':
                this.tempCode = line;
                this.authMode = 'register_user';
                this.setPrompt('用户名: ');
                break;

            case 'register_user':
                this.tempUsername = line;
                this.authMode = 'register_pass';
                this.passwordMode = true;
                this.setPrompt('密码: ');
                break;

            case 'register_pass': {
                this.passwordMode = false;
                this.tempPassword = line;
                this.authMode = 'register_nick';
                this.setPrompt('昵称: ');
                break;
            }

            case 'register_nick': {
                const registerMsg: RegisterMessage = {
                    type: MessageType.REGISTER,
                    payload: {
                        username: this.tempUsername.trim(),
                        password: this.tempPassword,
                        nickname: line.trim() || this.tempUsername.trim(),
                        email: this.pendingEmail,
                        verifyCode: this.tempCode.trim()
                    },
                    timestamp: new Date().toISOString(),
                    sender: '',
                    id: uuidv4()
                };
                this.send(registerMsg);
                this.pendingEmail = '';
                this.authMode = 'waiting';
                this.setPrompt('');
                this.addMessage('正在注册...');
                break;
            }

            case 'guest_nick': {
                if (!line) {
                    this.addError('昵称不能为空');
                    return;
                }
                this.nickname = line;
                const auth: AuthMessage = {
                    type: MessageType.AUTH,
                    payload: { nickname: line },
                    timestamp: new Date().toISOString(),
                    sender: '',
                    id: uuidv4()
                };
                this.send(auth);
                this.authMode = 'waiting';
                this.setPrompt('');
                this.addMessage('正在认证...');
                break;
            }

            case 'forgot_email': {
                if (!line) {
                    this.addError('邮箱不能为空');
                    return;
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) {
                    this.addError('邮箱格式不正确');
                    return;
                }
                this.pendingEmail = line;
                const verifyMsg: SendVerifyMessage = {
                    type: MessageType.SEND_VERIFY,
                    payload: { action: 'reset', email: line },
                    timestamp: new Date().toISOString(),
                    sender: '',
                    id: uuidv4()
                };
                this.send(verifyMsg);
                this.authMode = 'waiting';
                this.setPrompt('');
                this.addMessage('验证码已发送，请检查邮箱...');
                break;
            }

            case 'forgot_code':
                this.tempCode = line;
                this.authMode = 'forgot_pass';
                this.passwordMode = true;
                this.setPrompt('新密码: ');
                break;

            case 'forgot_pass': {
                this.passwordMode = false;
                const resetMsg: ResetPasswordMessage = {
                    type: MessageType.RESET_PASSWORD,
                    payload: {
                        email: this.pendingEmail,
                        verifyCode: this.tempCode.trim(),
                        newPassword: line
                    },
                    timestamp: new Date().toISOString(),
                    sender: '',
                    id: uuidv4()
                };
                this.send(resetMsg);
                this.pendingEmail = '';
                this.authMode = 'waiting';
                this.setPrompt('');
                this.addMessage('正在重置密码...');
                break;
            }

            case 'chat':
                this.handleChatInput(line);
                break;

            case 'waiting':
                this.addError('请等待服务器响应...');
                break;

            default:
                break;
        }
    }

    private handleAuthChoice(choice: string): void {
        switch (choice.trim()) {
            case '1':
                this.authMode = 'login_user';
                this.setPrompt('用户名: ');
                break;
            case '2':
                this.authMode = 'register_email';
                this.setPrompt('邮箱: ');
                break;
            case '3':
                this.authMode = 'guest_nick';
                this.setPrompt('昵称: ');
                break;
            case '4':
                this.authMode = 'forgot_email';
                this.setPrompt('注册邮箱: ');
                break;
            default:
                this.addError('无效选项');
                this.promptAuthChoice();
        }
    }

    private handleChatInput(line: string): void {
        if (line.startsWith('/')) {
            this.handleCommand(line);
        } else {
            const msg: ChatMessage = {
                type: MessageType.CHAT,
                payload: {
                    content: line,
                    room: this.currentRoom
                },
                timestamp: new Date().toISOString(),
                sender: this.nickname,
                id: uuidv4()
            };
            this.send(msg);
        }
    }

    // ==================== 网络处理 ====================

    private setupSocket(): void {
        this.socket.on('connect', () => {
            this.addMessage('已连接到服务器');
            this.promptAuthChoice();
        });

        this.socket.on('data', (chunk: Buffer) => {
            this.buffer += chunk.toString();
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line) as BaseMessage;
                    this.handleMessage(msg);
                } catch {
                    // 忽略解析失败
                }
            }
        });

        this.socket.on('close', () => {
            this.addMessage('连接已断开');
            this.restoreTerminal();
            process.exit(0);
        });

        this.socket.on('error', (err) => {
            this.addError(`连接错误: ${err.message}`);
            this.restoreTerminal();
            process.exit(1);
        });
    }

    // ==================== 认证 / 聊天流程 ====================

    private firstMenu(): void {
        this.addMessage('欢迎来到聊天室');
        this.addMessage('当前房间: Lobby | 输入 /help 查看可用命令');
    }

    private promptAuthChoice(): void {
        this.authMode = 'choice';
        this.addMessage('');
        this.addMessage('选择操作: [1]登录 [2]注册 [3]游客登录 [4]找回密码');
        this.setPrompt('请输入选项编号 > ');
    }

    private startChat(): void {
        if (this.chatStarted) return;
        this.chatStarted = true;
        this.authMode = 'chat';
        this.firstMenu();
        this.setPrompt(`[${this.currentRoom}] ${this.nickname}> `);
    }

    // ==================== 命令处理 ====================

    private handleCommand(line: string): boolean {
        const parts = line.slice(1).split(' ');
        const cmd = parts[0].toLowerCase();

        switch (cmd) {
            case 'help':
            case 'h':
                this.addMessage('可用命令:');
                this.addMessage('  /help, /h              显示帮助');
                this.addMessage('  /quit, /q              退出客户端');
                this.addMessage('  /w <昵称> <内容>        发送私聊');
                this.addMessage('  /join <房间名> [密码]   加入或创建房间');
                this.addMessage('  /list                  查看在线用户列表');
                this.addMessage('  /history               加载当前房间历史消息');
                this.addMessage('  /more                  加载更多历史消息');
                break;

            case 'list': {
                const listMsg: ListMessage = {
                    type: MessageType.LIST,
                    payload: { room: this.currentRoom },
                    timestamp: new Date().toISOString(),
                    sender: this.nickname,
                    id: uuidv4()
                };
                this.send(listMsg);
                break;
            }

            case 'admin': {
                if (parts.length < 2) {
                    this.addMessage('用法: /admin <命令> [参数]');
                    break;
                }
                const adminCmd = parts[1].toLowerCase();
                switch (adminCmd) {
                    case 'help': {
                        this.addMessage('管理员命令:');
                        this.addMessage('  /admin kick <昵称> <房间>     将用户踢出房间');
                        this.addMessage('  /admin mute <昵称> <分钟>     禁言用户');
                        this.addMessage('  /admin unmute <昵称>          解除用户禁言');
                        this.addMessage('  /admin deuser <昵称>          删除用户');
                        this.addMessage('  /admin search <房间> <关键词>  搜索消息');
                        this.addMessage('  /admin role <昵称> <角色>     修改用户角色 (MEMBER|ADMIN|MODERATOR)');
                        this.addMessage('  /admin deroom <房间>          删除房间');
                        this.addMessage('  /admin ban <昵称>             封禁用户');
                        this.addMessage('  /admin unban <昵称>           解除封禁');
                        break;
                    }
                    case 'kick': {
                        if (parts.length < 4) {
                            this.addMessage('用法: /admin kick <昵称> <房间>');
                            break;
                        }
                        const target = parts[2];
                        const room = parts[3];
                        this.send({
                            type: MessageType.COMMAND,
                            payload: { command: 'kick', target, room, duration: 300 },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        } as BaseMessage);
                        break;
                    }
                    case 'mute': {
                        if (parts.length < 4) {
                            this.addMessage('用法: /admin mute <昵称> <分钟>');
                            break;
                        }
                        const target = parts[2];
                        const minutes = parseInt(parts[3], 10);
                        if (isNaN(minutes) || minutes <= 0) {
                            this.addMessage('分钟数必须是正整数');
                            break;
                        }
                        this.send({
                            type: MessageType.COMMAND,
                            payload: { command: 'mute', target, duration: minutes * 60 },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        } as BaseMessage);
                        break;
                    }
                    case 'unmute': {
                        if (parts.length < 3) {
                            this.addMessage('用法: /admin unmute <昵称>');
                            break;
                        }
                        const target = parts[2];
                        this.send({
                            type: MessageType.COMMAND,
                            payload: { command: 'unmute', target },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        } as BaseMessage);
                        break;
                    }
                    case 'ban': {
                        if (parts.length < 3) {
                            this.addMessage('用法: /admin ban <昵称>');
                            break;
                        }
                        const target = parts[2];
                        this.send({
                            type: MessageType.COMMAND,
                            payload: { command: 'ban', target, duration: 86400 },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        } as BaseMessage);
                        break;
                    }
                    case 'unban': {
                        if (parts.length < 3) {
                            this.addMessage('用法: /admin unban <昵称>');
                            break;
                        }
                        const target = parts[2];
                        this.send({
                            type: MessageType.COMMAND,
                            payload: { command: 'unban', target },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        } as BaseMessage);
                        break;
                    }
                    case 'deuser': {
                        if (parts.length < 3) {
                            this.addMessage('用法: /admin deuser <昵称>');
                            break;
                        }
                        const target = parts[2];
                        this.send({
                            type: MessageType.COMMAND,
                            payload: { command: 'deuser', target },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        } as BaseMessage);
                        break;
                    }
                    case 'search': {
                        if (parts.length < 4) {
                            this.addMessage('用法: /admin search <房间> <关键词>');
                            break;
                        }
                        const room = parts[2];
                        const keyword = parts.slice(3).join(' ');
                        this.send({
                            type: MessageType.COMMAND,
                            payload: { command: 'search', room, keyword },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        } as BaseMessage);
                        break;
                    }
                    case 'role': {
                        if (parts.length < 4) {
                            this.addMessage('用法: /admin role <昵称> <角色>');
                            break;
                        }
                        const target = parts[2];
                        const role = parts[3].toUpperCase();
                        if (!['MEMBER', 'ADMIN', 'MODERATOR'].includes(role)) {
                            this.addMessage('角色必须是 MEMBER、ADMIN 或 MODERATOR');
                            break;
                        }
                        this.send({
                            type: MessageType.COMMAND,
                            payload: { command: 'role', target, role },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        } as BaseMessage);
                        break;
                    }
                    case 'deroom': {
                        if (parts.length < 3) {
                            this.addMessage('用法: /admin deroom <房间>');
                            break;
                        }
                        const room = parts[2];
                        this.send({
                            type: MessageType.COMMAND,
                            payload: { command: 'deroom', room },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        } as BaseMessage);
                        break;
                    }
                    default:
                        this.addMessage('未知管理员命令: ' + adminCmd);
                }
                break;
            }

            case 'quit':
            case 'q':
                this.socket.end();
                return false;

            case 'w':
            case 'whisper':
                if (parts.length < 3) {
                    this.addMessage('用法: /w <昵称> <内容>');
                    break;
                }
                {
                    const target = parts[1];
                    const content = parts.slice(2).join(' ');
                    const whisper: WhisperMessage = {
                        type: MessageType.WHISPER,
                        payload: { target, content },
                        timestamp: new Date().toISOString(),
                        sender: this.nickname,
                        id: uuidv4()
                    };
                    this.send(whisper);
                }
                break;

            case 'join':
                if (parts.length < 2) {
                    this.addMessage('用法: /join <房间名>');
                    break;
                }
                {
                    const roomName = parts[1];
                    const oldRoom = this.currentRoom;
                    this.currentRoom = roomName;
                    this.setPrompt(`[${this.currentRoom}] ${this.nickname}> `);
                    const join: JoinMessage = {
                        type: MessageType.JOIN,
                        payload: { room: roomName },
                        timestamp: new Date().toISOString(),
                        sender: this.nickname,
                        id: uuidv4()
                    };
                    this.send(join);
                    this.addMessage(`正在加入房间 ${roomName}...`);
                }
                break;

            case 'history': {
                const history: HistoryMessage = {
                    type: MessageType.HISTORY,
                    payload: { room: this.currentRoom, limit: 20 },
                    timestamp: new Date().toISOString(),
                    sender: this.nickname,
                    id: uuidv4()
                };
                this.send(history);
                break;
            }

            case 'more':
                if (this.lastHistoryId !== null) {
                    const more: HistoryMessage = {
                        type: MessageType.HISTORY,
                        payload: {
                            room: this.currentRoom,
                            beforeId: this.lastHistoryId,
                            limit: 20
                        },
                        timestamp: new Date().toISOString(),
                        sender: this.nickname,
                        id: uuidv4()
                    };
                    this.send(more);
                } else {
                    this.addMessage('请先使用 /history 加载历史消息');
                }
                break;

            default:
                this.addMessage('未知命令: ' + cmd);
        }
        return true;
    }

    // ==================== 消息处理 ====================

    private handleMessage(msg: BaseMessage): void {
        switch (msg.type) {
            case MessageType.AUTH_OK:
                this.addMessage('认证成功！');
                this.startChat();
                break;

            case MessageType.AUTH_FAIL:
                this.addError('认证失败: ' + ((msg as any).payload?.reason || '未知原因'));
                this.promptAuthChoice();
                break;

            case MessageType.REGISTER_OK: {
                const rOk = msg as RegisterOkMessage;
                this.addMessage(`注册成功！欢迎 ${rOk.payload.nickname}`);
                break;
            }

            case MessageType.REGISTER_FAIL: {
                const rFail = msg as RegisterFailMessage;
                this.addError('注册失败: ' + rFail.payload.reason);
                this.promptAuthChoice();
                break;
            }

            case MessageType.LOGIN_OK: {
                const lOk = msg as LoginOkMessage;
                this.token = lOk.payload.token;
                this.nickname = lOk.payload.user.nickname;
                this.addMessage(`登录成功！欢迎 ${lOk.payload.user.nickname}`);
                this.startChat();
                break;
            }

            case MessageType.LOGIN_FAIL: {
                const lFail = msg as LoginFailMessage;
                this.addError('登录失败: ' + lFail.payload.reason);
                this.promptAuthChoice();
                break;
            }

            case MessageType.TOKEN_OK: {
                const tOk = msg as TokenOkMessage;
                this.nickname = tOk.payload.nickname;
                this.addMessage('Token 认证成功！');
                this.startChat();
                break;
            }

            case MessageType.TOKEN_FAIL:
                this.addError('Token 已过期，请重新登录');
                this.promptAuthChoice();
                break;

            case MessageType.HISTORY_DATA: {
                const h = msg as HistoryDataMessage;
                if (h.payload.messages.length === 0) {
                    this.addMessage('--- 没有更多历史消息 ---');
                } else {
                    for (const m of h.payload.messages) {
                        const time = new Date(m.createdAt * 1000).toLocaleTimeString();
                        this.addMessage(`[${time}] ${m.sender}: ${m.content}`);
                    }
                    if (h.payload.hasMore) {
                        this.lastHistoryId = h.payload.messages[h.payload.messages.length - 1].id;
                        this.addMessage('--- 输入 /more 加载更多 ---');
                    } else {
                        this.lastHistoryId = null;
                        this.addMessage('--- 已加载全部历史消息 ---');
                    }
                }
                break;
            }

            case MessageType.CHAT: {
                const chatPayload = (msg as ChatMessage).payload;
                this.addMessage(`[${msg.sender}] ${chatPayload.content}`);
                break;
            }

            case MessageType.WHISPER: {
                const whisperPayload = (msg as WhisperMessage).payload;
                this.addMessage(`\x1b[35m[私聊 ${msg.sender} \u2192 你] ${whisperPayload.content}\x1b[0m`);
                break;
            }

            case MessageType.SYSTEM:
                this.addMessage(`[System] ${(msg as any).payload?.content || ''}`);
                break;

            case MessageType.PRESENCE: {
                const p = (msg as any).payload;
                this.addMessage(`\x1b[36m${p.nickname} ${p.action === 'join' ? '进入' : '离开'}了 ${p.room}\x1b[0m`);
                break;
            }

            case MessageType.USER_LIST: {
                const ul = msg as UserListMessage;
                const users = ul.payload.users;
                if (users.length === 0) {
                    this.addMessage('当前没有在线用户');
                } else {
                    this.addMessage(`=== 在线用户 (${users.length}) ===`);
                    for (const u of users) {
                        const statusIcon = u.status === 'online' ? '\x1b[32m\u25cf\x1b[0m' : '\x1b[33m\u25cf\x1b[0m';
                        this.addMessage(`  ${statusIcon} ${u.nickname}  @${u.room}`);
                    }
                }
                break;
            }

            case MessageType.PING:
                this.send({
                    type: MessageType.PONG,
                    payload: { timestamp: Date.now() },
                    timestamp: new Date().toISOString(),
                    sender: this.nickname,
                    id: uuidv4()
                } as BaseMessage);
                break;

            case MessageType.ERROR:
                this.addError(`[Error] ${(msg as any).payload?.message || ''}`);
                break;

            case MessageType.VERIFY_OK: {
                const vOk = msg as VerifyOkMessage;
                if (vOk.payload.action === 'reset') {
                    this.authMode = 'forgot_code';
                    this.setPrompt('验证码: ');
                } else {
                    this.authMode = 'register_code';
                    this.setPrompt('验证码: ');
                }
                break;
            }

            case MessageType.VERIFY_FAIL:
                this.addError('验证码发送失败: ' + ((msg as any).payload?.reason || '未知原因'));
                this.pendingEmail = '';
                this.promptAuthChoice();
                break;

            case MessageType.RESET_PASSWORD_OK: {
                const resetOk = msg as ResetPasswordOkMessage;
                this.addMessage(`${resetOk.payload.message} (${resetOk.payload.username})`);
                this.addMessage('请使用新密码重新登录');
                this.promptAuthChoice();
                break;
            }

            case MessageType.RESET_PASSWORD_FAIL: {
                const resetFail = msg as ResetPasswordFailMessage;
                this.addError('重置密码失败: ' + resetFail.payload.reason);
                this.promptAuthChoice();
                break;
            }

            default:
                break;
        }
    }

    // ==================== 工具方法 ====================

    private send(msg: BaseMessage): void {
        this.socket.write(JSON.stringify(msg) + '\n');
    }
}
