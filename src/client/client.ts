import { createConnection, Socket } from 'net';
import * as readline from 'readline';
import {
    BaseMessage, MessageType, AuthMessage, ChatMessage, WhisperMessage, JoinMessage,
    RegisterMessage, LoginMessage, HistoryMessage,
    RegisterOkMessage, RegisterFailMessage, LoginOkMessage, LoginFailMessage,
    TokenOkMessage, TokenFailMessage, HistoryDataMessage,
    SendVerifyMessage, VerifyOkMessage,
    ResetPasswordMessage, ResetPasswordOkMessage, ResetPasswordFailMessage
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
    private pendingEmail: string = ''; // 注册时暂存邮箱

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
            console.log(' 已连接到服务器');
            this.promptAuthChoice();
        });

        this.socket.on('data', (chunk: Buffer) => {
            this.buffer += chunk.toString();
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop() || '';

            //这里是对服务器发来的数据进行处理，一次性接受多条信息或者一半信息的时候
            // 通过换行符分割成多条消息，最后一条如果不完整就保存在 buffer 中等待下一次数据到来时继续拼接
            // 逐行处理完整的消息

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line) as BaseMessage;
                    this.handleMessage(msg);
                } catch {
                    // 忽略解析失败
                }
            }
            /**
             * 这里为什么回调函数一直在监听
             * 因为回调函数被注册到了 socket 的 'data' 事件上，
             * 每当服务器发送数据到客户端时，这个回调函数就会被触发执行一次，处理接收到的数据。
             * 这种事件驱动的设计使得客户端能够持续监听服务器的消息，而不需要阻塞主线程等待数据到来。
             * 当服务器发送数据时，回调函数会被调用，处理完当前数据后继续等待下一次数据到来，形成一个持续的监听循环。
             * 这也是 Node.js 中常见的异步事件处理模式，使得应用能够高效地响应外部事件而不阻塞执行流程。
             * 
             */
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
        //这三个异步函数分别处理连接成功、接收数据、连接关闭和错误事件，确保客户端能够正确响应服务器的状态变化和消息。
        //
    }

    private firstMenu(): void {
        console.log('欢迎来到聊天室');
        console.log('用户默认房间是 Lobby, 你可以使用/help查询你能做的指令');
    }

    private promptAuthChoice(): void {
        if ((this.rl as any).closed) return;
        this.rl.question('选择操作: [1]登录 [2]注册 [3]游客登录 [4]找回密码 > ', (choice) => {
            switch (choice.trim()) {
                case '1': this.promptLogin(); break;
                case '2': this.promptRegister(); break;
                case '3': this.promptGuestLogin(); break;
                case '4': this.promptForgotPassword(); break;
                default:
                    console.log('无效选项');
                    this.promptAuthChoice();
                    //简单的递归思路解决输入错误后重新提示选择
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
        this.rl.question('邮箱: ', (email) => {
            const trimmedEmail = email.trim();
            if (!trimmedEmail) {
                console.log('邮箱不能为空');
                this.promptRegister();
                return;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
                console.log('邮箱格式不正确');
                this.promptRegister();
                return;
            }
            this.pendingEmail = trimmedEmail;
            const verifyMsg: SendVerifyMessage = {
                type: MessageType.SEND_VERIFY,
                payload: {
                    action: 'register',
                    email: trimmedEmail
                },
                timestamp: new Date().toISOString(),
                sender: '',
                id: uuidv4()
            };
            this.send(verifyMsg);
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

    private promptForgotPassword(): void {
        this.rl.question('请输入注册邮箱: ', (email) => {
            const trimmedEmail = email.trim();
            if (!trimmedEmail) {
                console.log('邮箱不能为空');
                this.promptForgotPassword();
                return;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
                console.log('邮箱格式不正确');
                this.promptForgotPassword();
                return;
            }
            this.pendingEmail = trimmedEmail;
            const verifyMsg: SendVerifyMessage = {
                type: MessageType.SEND_VERIFY,
                payload: {
                    action: 'reset',
                    email: trimmedEmail
                },
                timestamp: new Date().toISOString(),
                sender: '',
                id: uuidv4()
            };
            this.send(verifyMsg);
        });
    }

    private startChat(): void {
        if (this.chatStarted) return;
        this.chatStarted = true;
        this.firstMenu();

        this.rl.setPrompt(`${this.nickname}[${this.currentRoom}]> `);
        //这行代码用到了 readline 模块的 setPrompt 方法，设
        // 置了用户输入提示符的格式为 "昵称[当前房间]> "，
        // 以便用户在输入消息时能够清楚地看到自己当前的身份和所在的房间。
        this.rl.prompt();
        //每次都是触发这个提示符，并且rlon监听器会一直监听用户输入，直到用户退出或者连接断开

        this.rl.on('line', (input) => {
            //每当用户输入一行文本并按下回车键时，这个事件处理器就会被触发，接收用户输入的内容作为参数进行处理。
            const line = input.trim();
            // 这里的逻辑是先检查用户输入是否以 '/' 开头，如果是，则将其视为命令并调用 handleCommand 方法进行处理；
            // 否则，将其视为普通聊天消息，构造一个 ChatMessage 对象并发送给服务器。
            if (!line) {
                this.rl.prompt();
                return;
                // 如果用户输入为空行，则直接重新显示提示符，等待下一次输入，而不进行任何处理。
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
        //切除命令前的 '/'，然后通过空格分割成多个部分，第一部分是命令名称，后续部分是命令参数。
        const cmd = parts[0].toLowerCase();
        //根据不同的命令名称执行对应的逻辑
        //这里因为切除过了0索引的 '/'，所以直接从 parts[0] 开始就是命令名称了，不需要再加1了

        switch (cmd) {
            case 'help':
            case 'h':
                console.log('可用命令:');
                console.log('  /help, /h              显示帮助');
                console.log('  /quit, /q              退出客户端');
                console.log('  /w <昵称> <内容>        发送私聊');
                console.log('  /join <房间名> [密码]   加入或创建房间');
                console.log('  /history               加载当前房间历史消息');
                console.log('  /more                  加载更多历史消息');
                break;
            case 'admin':{
                if (parts.length < 2) {
                    console.log('用法: /admin <命令> [参数]');
                    break;
                }
                const adminCmd = parts[1].toLowerCase();
                switch(adminCmd){
                    case 'help':{
                        console.log('管理员命令:');
                        console.log('  /admin kick <昵称> <房间>     将用户踢出房间');
                        console.log('  /admin mute <昵称> <分钟>     禁言用户');
                        console.log('  /admin unmute <昵称>          解除用户禁言');
                        console.log('  /admin deuser <昵称>          删除用户');
                        console.log('  /admin search <房间> <关键词>  搜索消息');
                        console.log('  /admin role <昵称> <角色>     修改用户角色 (MEMBER|ADMIN|MODERATOR)');
                        console.log('  /admin deroom <房间>          删除房间');
                        console.log('  /admin ban <昵称>             封禁用户');
                        console.log('  /admin unban <昵称>           解除封禁');
                        break;
                    }
                    case 'kick':{
                        if (parts.length < 4) {
                            console.log('用法: /admin kick <昵称> <房间>');
                            break;
                        }
                        const target = parts[2];
                        const room = parts[3];
                        const cmdMsg: BaseMessage = {
                            type: MessageType.COMMAND,
                            payload: { command: 'kick', target, room, duration: 300 },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        };
                        this.send(cmdMsg);
                        break;
                    }
                    case 'mute':{
                        if (parts.length < 4) {
                            console.log('用法: /admin mute <昵称> <分钟>');
                            break;
                        }
                        const target = parts[2];
                        const minutes = parseInt(parts[3], 10);
                        if (isNaN(minutes) || minutes <= 0) {
                            console.log('分钟数必须是正整数');
                            break;
                        }
                        const cmdMsg: BaseMessage = {
                            type: MessageType.COMMAND,
                            payload: { command: 'mute', target, duration: minutes * 60 },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        };
                        this.send(cmdMsg);
                        break;
                    }
                    case 'unmute':{
                        if (parts.length < 3) {
                            console.log('用法: /admin unmute <昵称>');
                            break;
                        }
                        const target = parts[2];
                        const cmdMsg: BaseMessage = {
                            type: MessageType.COMMAND,
                            payload: { command: 'unmute', target },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        };
                        this.send(cmdMsg);
                        break;
                    }
                    case 'ban':{
                        if (parts.length < 3) {
                            console.log('用法: /admin ban <昵称>');
                            break;
                        }
                        const target = parts[2];
                        const cmdMsg: BaseMessage = {
                            type: MessageType.COMMAND,
                            payload: { command: 'ban', target, duration: 86400 },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        };
                        this.send(cmdMsg);
                        break;
                    }
                    case 'unban':{
                        if (parts.length < 3) {
                            console.log('用法: /admin unban <昵称>');
                            break;
                        }
                        const target = parts[2];
                        const cmdMsg: BaseMessage = {
                            type: MessageType.COMMAND,
                            payload: { command: 'unban', target },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        };
                        this.send(cmdMsg);
                        break;
                    }
                    case 'deuser':{
                        if (parts.length < 3) {
                            console.log('用法: /admin deuser <昵称>');
                            break;
                        }
                        const target = parts[2];
                        const cmdMsg: BaseMessage = {
                            type: MessageType.COMMAND,
                            payload: { command: 'deuser', target },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        };
                        this.send(cmdMsg);
                        break;
                    }
                    case 'search':{
                        if (parts.length < 4) {
                            console.log('用法: /admin search <房间> <关键词>');
                            break;
                        }
                        const room = parts[2];
                        const keyword = parts.slice(3).join(' ');
                        const cmdMsg: BaseMessage = {
                            type: MessageType.COMMAND,
                            payload: { command: 'search', room, keyword },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        };
                        this.send(cmdMsg);
                        break;
                    }
                    case 'role':{
                        if (parts.length < 4) {
                            console.log('用法: /admin role <昵称> <角色>');
                            break;
                        }
                        const target = parts[2];
                        const role = parts[3].toUpperCase();
                        if (!['MEMBER', 'ADMIN', 'MODERATOR'].includes(role)) {
                            console.log('角色必须是 MEMBER、ADMIN 或 MODERATOR');
                            break;
                        }
                        const cmdMsg: BaseMessage = {
                            type: MessageType.COMMAND,
                            payload: { command: 'role', target, role },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        };
                        this.send(cmdMsg);
                        break;
                    }
                    case 'deroom':{
                        if (parts.length < 3) {
                            console.log('用法: /admin deroom <房间>');
                            break;
                        }
                        const room = parts[2];
                        const cmdMsg: BaseMessage = {
                            type: MessageType.COMMAND,
                            payload: { command: 'deroom', room },
                            timestamp: new Date().toISOString(),
                            sender: this.nickname,
                            id: uuidv4()
                        };
                        this.send(cmdMsg);
                        break;
                    }
                    default:
                        console.log('未知管理员命令:', adminCmd);
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
                    console.log('用法: /w <昵称> <内容>');
                    break;
                }
                const target = parts[1];
                const content = parts.slice(2).join(' ');
                // 构造私聊消息并发送
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
                this.currentRoom = roomName;
                this.rl.setPrompt(`${this.nickname}[${this.currentRoom}]> `);
                //重新设计置提示符以反映当前房间的变化
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
        //直接枚举消息类型跳转到对应的处理逻辑，保持代码清晰和可维护
        switch (msg.type) {
            case MessageType.AUTH_OK:
                console.log(' 认证成功！');
                this.startChat();
                break;

            case MessageType.AUTH_FAIL:
                console.log(' 认证失败:', (msg as any).payload?.reason || '未知原因');
                this.promptGuestLogin();
                break;

            case MessageType.REGISTER_OK:
                const rOk = msg as RegisterOkMessage;
                console.log(` 注册成功！欢迎 ${rOk.payload.nickname}`);
                break;

            case MessageType.REGISTER_FAIL:
                const rFail = msg as RegisterFailMessage;
                console.log(' 注册失败:', rFail.payload.reason);
                this.promptAuthChoice();
                break;

            case MessageType.LOGIN_OK:
                const lOk = msg as LoginOkMessage;
                this.token = lOk.payload.token;
                this.nickname = lOk.payload.user.nickname;
                console.log(` 登录成功！欢迎 ${lOk.payload.user.nickname}`);
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

            case MessageType.VERIFY_OK:
                const vOk = msg as VerifyOkMessage;
                console.log('验证码已发送，请检查你的邮箱');
                if (vOk.payload.action === 'reset') {
                    // 找回密码流程
                    this.rl.question('请输入验证码: ', (code) => {
                        this.rl.question('请输入新密码: ', (newPassword) => {
                            const resetMsg: ResetPasswordMessage = {
                                type: MessageType.RESET_PASSWORD,
                                payload: {
                                    email: this.pendingEmail,
                                    verifyCode: code.trim(),
                                    newPassword
                                },
                                timestamp: new Date().toISOString(),
                                sender: '',
                                id: uuidv4()
                            };
                            this.send(resetMsg);
                            this.pendingEmail = '';
                        });
                    });
                } else {
                    // 注册流程
                    this.rl.question('请输入验证码: ', (code) => {
                        this.rl.question('请输入用户名: ', (username) => {
                            this.rl.question('请输入密码: ', (password) => {
                                this.rl.question('请输入昵称: ', (nickname) => {
                                    const registerMsg: RegisterMessage = {
                                        type: MessageType.REGISTER,
                                        payload: {
                                            username: username.trim(),
                                            password,
                                            nickname: nickname.trim() || username.trim(),
                                            email: this.pendingEmail,
                                            verifyCode: code.trim()
                                        },
                                        timestamp: new Date().toISOString(),
                                        sender: '',
                                        id: uuidv4()
                                    };
                                    this.send(registerMsg);
                                    this.pendingEmail = '';
                                });
                            });
                        });
                    });
                }
                break;

            case MessageType.VERIFY_FAIL:
                console.log('验证码发送失败:', (msg as any).payload?.reason || '未知原因');
                this.pendingEmail = '';
                this.promptAuthChoice();
                break;

            case MessageType.RESET_PASSWORD_OK:
                const resetOk = msg as ResetPasswordOkMessage;
                console.log(`✅ ${resetOk.payload.message} (${resetOk.payload.username})`);
                console.log('请使用新密码重新登录');
                this.promptAuthChoice();
                break;

            case MessageType.RESET_PASSWORD_FAIL:
                const resetFail = msg as ResetPasswordFailMessage;
                console.log('❌ 重置密码失败:', resetFail.payload.reason);
                this.promptAuthChoice();
                break;

            default:
                break;
        }

        // 如果正在聊天模式且收到展示类消息，恢复 readline 提示符
        if (this.chatStarted) {
            switch (msg.type) {
                case MessageType.CHAT:
                case MessageType.WHISPER:
                case MessageType.SYSTEM:
                case MessageType.PRESENCE:
                case MessageType.ERROR:
                case MessageType.HISTORY_DATA:
                    this.rl.prompt();
                    break;
            }
        }
    }

    private send(msg: BaseMessage): void {
        this.socket.write(JSON.stringify(msg) + '\n');
    }
}
