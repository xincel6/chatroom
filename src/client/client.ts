import { createConnection, Socket } from 'net';
import * as readline from 'readline';
import { BaseMessage, MessageType, AuthMessage, ChatMessage, WhisperMessage, JoinMessage } from '../shared/protocol';
import { v4 as uuidv4 } from 'uuid';

export class ChatClient {
    private socket: Socket;
    private rl: readline.Interface;
    private nickname: string = '';
    private currentRoom: string = 'Lobby';
    private buffer: string = '';
    private chatStarted: boolean = false;

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
            this.promptNickname();
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

    private promptNickname(): void {
        if ((this.rl as any).closed) return;
        this.rl.question('请输入昵称: ', (name) => {
            const trimmed = name.trim();
            if (!trimmed) {
                console.log('昵称不能为空');
                this.promptNickname();
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
                this.promptNickname();
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