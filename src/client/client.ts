import { createConnection, Socket } from 'net';
import * as readline from 'readline';
import {
    BaseMessage, MessageType, AuthMessage, ChatMessage, WhisperMessage, JoinMessage,
    RegisterMessage, LoginMessage, HistoryMessage,
    RegisterOkMessage, RegisterFailMessage, LoginOkMessage, LoginFailMessage,
    TokenOkMessage, TokenFailMessage, HistoryDataMessage
} from '../shared/protocol';
import { v4 as uuidv4 } from 'uuid';

export class ChatClient {
    private socket: Socket;
    private rl: readline.Interface;
    private nickname: string = '';
    private currentRoom: string = 'Lobby';
    private buffer: string = '';
    private chatStarted: boolean = false;
    private token: string = '';
    private lastHistoryId: number | null = null;

    constructor(host: string, port: number) {
        this.socket = createConnection({ host, port });
        
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.setupSocket();
    }

    private setupSocket(): void {
        this.socket.on('connect', () => {
            console.log('✅ 已连接到服务器');
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
            console.log('\n❌ 连接已断开');
            this.rl.close();
            process.exit(0);
        });

        this.socket.on('error', (err) => {
            console.log('连接错误:', err.message);
            process.exit(1);
        });
    }

    private promptAuthChoice(): void {
        if ((this.rl as any).closed) return;
        this.rl.question('选择操作: [1]登录 [2]注册 [3]游客登录 > ', (choice) => {
            switch (choice.trim()) {
                case '1': this.promptLogin(); break;
                case '2': this.promptRegister(); break;
                case '3': this.promptGuestLogin(); break;
                default:
                    console.log('无效选项');
                    this.promptAuthChoice();
            }
        });
    }

    private promptLogin(): void {
        this.rl.question('用户名: ', (username) => {
            this.rl.question('密码: ', (password) => {
                const login: LoginMessage = {
                    type: MessageType.LOGIN,
                    payload: { username: username.trim(), password },
                    timestamp: new Date().toISOString(),
                    sender: '',
                    id: uuidv4()
                };
                this.send(login);
            });
        });
    }

    private promptRegister(): void {
        this.rl.question('用户名 (3-20位字母/数字/下划线): ', (username) => {
            this.rl.question('密码 (6-32位): ', (password) => {
                this.rl.question('昵称 (1-20位): ', (nickname) => {
                    const register: RegisterMessage = {
                        type: MessageType.REGISTER,
                        payload: {
                            username: username.trim(),
                            password,
                            nickname: nickname.trim()
                        },
                        timestamp: new Date().toISOString(),
                        sender: '',
                        id: uuidv4()
                    };
                    this.send(register);
                });
            });
        });
    }

    private promptGuestLogin(): void {
        this.rl.question('请输入昵称: ', (name) => {
            const trimmed = name.trim();
            if (!trimmed) {
                console.log('昵称不能为空');
                this.promptGuestLogin();
                return;
            }
            this.nickname = trimmed;
            const auth: AuthMessage = {
                type: MessageType.AUTH,
                payload: { nickname: trimmed },
                timestamp: new Date().toISOString(),
                sender: '',
                id: uuidv4()
            };
            this.send(auth);
        });
    }

    private startChat(): void {
        if (this.chatStarted) return;
        this.chatStarted = true;

        this.rl.setPrompt(`${this.nickname}[${this.currentRoom}]> `);
        this.rl.prompt();

        this.rl.on('line', (input) => {
            const line = input.trim();
            if (!line) {
                this.rl.prompt();
                return;
            }

            if (line.startsWith('/')) {
                const needPrompt = this.handleCommand(line);
                if (needPrompt) this.rl.prompt();
            } else {
                // 普通聊天
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
                this.rl.prompt();
            }
        });
    }

    private handleCommand(line: string): boolean {
        const parts = line.slice(1).split(' ');
        const cmd = parts[0].toLowerCase();

        switch (cmd) {
            case 'quit':
            case 'q':
                this.socket.end();
                return false;
            
            case 'w':
            case 'whisper':
                if (parts.length < 3) {
                    console.log('用法: /w <昵称> <内容>');
                    break;
                }
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
                break;

            case 'join':
                if (parts.length < 2) {
                    console.log('用法: /join <房间名>');
                    break;
                }
                const roomName = parts[1];
                const join: JoinMessage = {
                    type: MessageType.JOIN,
                    payload: { room: roomName },
                    timestamp: new Date().toISOString(),
                    sender: this.nickname,
                    id: uuidv4()
                };
                this.send(join);
                break;

            case 'history':
                const history: HistoryMessage = {
                    type: MessageType.HISTORY,
                    payload: { room: this.currentRoom, limit: 20 },
                    timestamp: new Date().toISOString(),
                    sender: this.nickname,
                    id: uuidv4()
                };
                this.send(history);
                break;

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
                    console.log('请先使用 /history 加载历史消息');
                }
                break;

            default:
                console.log('未知命令:', cmd);
        }
        return true;
    }

    private handleMessage(msg: BaseMessage): void {
        switch (msg.type) {
            case MessageType.AUTH_OK:
                console.log('🎉 认证成功！');
                this.startChat();
                break;

            case MessageType.AUTH_FAIL:
                console.log('❌ 认证失败:', (msg as any).payload?.reason || '未知原因');
                this.promptGuestLogin();
                break;

            case MessageType.REGISTER_OK:
                const rOk = msg as RegisterOkMessage;
                console.log(`🎉 注册成功！欢迎 ${rOk.payload.nickname}`);
                break;

            case MessageType.REGISTER_FAIL:
                const rFail = msg as RegisterFailMessage;
                console.log('❌ 注册失败:', rFail.payload.reason);
                this.promptAuthChoice();
                break;

            case MessageType.LOGIN_OK:
                const lOk = msg as LoginOkMessage;
                this.token = lOk.payload.token;
                this.nickname = lOk.payload.user.nickname;
                console.log(`🎉 登录成功！欢迎 ${lOk.payload.user.nickname}`);
                this.startChat();
                break;

            case MessageType.LOGIN_FAIL:
                const lFail = msg as LoginFailMessage;
                console.log('❌ 登录失败:', lFail.payload.reason);
                this.promptAuthChoice();
                break;

            case MessageType.TOKEN_OK:
                const tOk = msg as TokenOkMessage;
                this.nickname = tOk.payload.nickname;
                console.log('🎉 Token 认证成功！');
                this.startChat();
                break;

            case MessageType.TOKEN_FAIL:
                console.log('❌ Token 已过期，请重新登录');
                this.promptAuthChoice();
                break;

            case MessageType.HISTORY_DATA:
                const h = msg as HistoryDataMessage;
                if (h.payload.messages.length === 0) {
                    console.log('--- 没有更多历史消息 ---');
                } else {
                    for (const m of h.payload.messages) {
                        const time = new Date(m.createdAt * 1000).toLocaleTimeString();
                        console.log(`[${time}] ${m.sender}: ${m.content}`);
                    }
                    if (h.payload.hasMore) {
                        this.lastHistoryId = h.payload.messages[h.payload.messages.length - 1].id;
                        console.log('--- 输入 /more 加载更多 ---');
                    } else {
                        this.lastHistoryId = null;
                        console.log('--- 已加载全部历史消息 ---');
                    }
                }
                break;

            case MessageType.CHAT:
                const chatPayload = (msg as ChatMessage).payload;
                console.log(`\n[${msg.sender}] ${chatPayload.content}`);
                break;

            case MessageType.WHISPER:
                const whisperPayload = (msg as WhisperMessage).payload;
                console.log(`\n[私聊 ${msg.sender}→你] ${whisperPayload.content}`);
                break;

            case MessageType.SYSTEM:
                console.log(`\n[System] ${(msg as any).payload?.content || ''}`);
                break;

            case MessageType.PRESENCE:
                const p = (msg as any).payload;
                console.log(`\n👤 ${p.nickname} ${p.action === 'join' ? '进入' : '离开'}了 ${p.room}`);
                break;

            case MessageType.PING:
                // 自动回复心跳
                this.send({
                    type: MessageType.PONG,
                    payload: { timestamp: Date.now() },
                    timestamp: new Date().toISOString(),
                    sender: this.nickname,
                    id: uuidv4()
                });
                break;

            case MessageType.ERROR:
                console.log(`\n[Error] ${(msg as any).payload?.message || ''}`);
                break;

            default:
                break;
        }
    }

    private send(msg: BaseMessage): void {
        this.socket.write(JSON.stringify(msg) + '\n');
    }
}
