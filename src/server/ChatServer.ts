import { createServer, Server, Socket } from "net";
import { User, UserRole } from "./User";
import { Room } from "./Room";
import { 
    BaseMessage, MessageType, AuthMessage, ChatMessage, WhisperMessage, JoinMessage,
    isAuthMessage, isChatMessage, isJoinMessage, isPongMessage, isWhisperMessage,
    isRegisterMessage, isLoginMessage, isTokenMessage, isHistoryMessage,
    RegisterMessage, LoginMessage, TokenMessage, HistoryMessage
} from '../shared/protocol';
import { v4 as uuidv4 } from 'uuid';
import { StoreManager } from './store/StoreManager';
import { AuthManager } from './auth/AuthManager';

const HEARTBEAT_INTERVAL = parseInt(process.env.CHAT_HEARTBEAT_INTERVAL || '30000', 10);
const HEARTBEAT_TIMEOUT = parseInt(process.env.CHAT_HEARTBEAT_TIMEOUT || '60000', 10);

export class ChatServer {
    private server: Server;
    private users: Map<Socket, User>;
    private nicknames: Map<string, User>;
    private rooms: Map<string, Room>;
    private port: number;
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private store: StoreManager;
    private authManager: AuthManager;

    constructor(port: number, dataDir?: string) {
        this.port = port;
        this.server = createServer();
        this.users = new Map();
        this.nicknames = new Map();
        this.rooms = new Map();

        // 初始化数据层
        this.store = StoreManager.getInstance(dataDir);
        this.authManager = new AuthManager();

        // 从持久化数据加载房间
        this.loadRoomsFromStore();
    }

    /** 启动时从 Store 加载房间 */
    private loadRoomsFromStore(): void {
        const roomRecords = this.store.rooms.getAll();
        for (const record of roomRecords) {
            if (!this.rooms.has(record.name)) {
                this.rooms.set(record.name, new Room(record.name, {
                    password: record.passwordHash || undefined,
                    maxUsers: record.config.maxUsers,
                }));
            }
        }
        // 确保 Lobby 存在
        if (!this.rooms.has('Lobby')) {
            this.rooms.set('Lobby', new Room('Lobby'));
            this.store.rooms.create({
                name: 'Lobby', passwordHash: '', creatorId: 0,
                config: { maxUsers: 100, isDefault: true },
            });
        }
    }

    public start(): void {
        this.server.on('connection', (socket) => this.handleConnection(socket));
        this.server.listen(this.port, () => {
            console.log(`聊天服务器启动在端口 ${this.port}`);
        });
        this.heartbeatTimer = setInterval(() => this.sendPing(), HEARTBEAT_INTERVAL);
    }

    public stop(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        this.server.close();
        for (const [socket] of this.users) {
            socket.destroy();
        }
        this.users.clear();
        this.nicknames.clear();
        this.rooms.clear();
        // 刷新所有数据到文件
        this.store.flushAll();
        this.store.close();
    }

    private sendPing(): void {
        for (const [socket, user] of this.users) {
            if (!user.isAuthenticated) continue;
            if (user.isHeartbeatTimedOut(HEARTBEAT_TIMEOUT)) {
                console.log(`用户 ${user.nickname} 心跳超时`);
                socket.destroy();
                continue;
            }
            user.addMissedPing();
            user.sendMessage({
                type: MessageType.PING,
                payload: { timestamp: Date.now() },
                timestamp: new Date().toISOString(),
                sender: 'system',
                id: uuidv4()
            } as BaseMessage);
        }
    }

    private handleConnection(socket: Socket): void {
        let buffer = '';
        const user = new User(socket);
        this.users.set(socket, user);

        socket.on('data', (chunk) => {
            buffer += chunk.toString();
            const messages = buffer.split('\n');
            buffer = messages.pop() || '';
            
            for (const msgStr of messages) {
                if (!msgStr.trim()) continue;
                try {
                    const msg = JSON.parse(msgStr) as BaseMessage;
                    this.handleMessage(user, msg);
                } catch (e) {
                    user.sendSystemMessage('格式错误！');
                }
            }
        });

        socket.on('close', () => this.handleDisconnect(socket));
        socket.on('error', () => this.handleDisconnect(socket));
    }

    private async handleMessage(user: User, msg: BaseMessage): Promise<void> {
        if (!user.isAuthenticated) {
            if (isRegisterMessage(msg)) {
                await this.handleRegister(user, msg as RegisterMessage);
                return;
            }
            if (isLoginMessage(msg)) {
                await this.handleLogin(user, msg as LoginMessage);
                return;
            }
            if (isAuthMessage(msg)) {
                this.handleAuth(user, msg as AuthMessage);  // 游客模式（向后兼容）
                return;
            }
            if (isTokenMessage(msg)) {
                await this.handleTokenAuth(user, msg as TokenMessage);
                return;
            }
            user.sendSystemMessage('请先登录或注册！用法: /register 或 /login');
            return;
        }

        if (isChatMessage(msg)) {
            await this.handleChat(user, msg as ChatMessage);
        } else if (isJoinMessage(msg)) {
            this.handleJoin(user, msg as JoinMessage);
        } else if (isPongMessage(msg)) {
            user.recordPong();
        } else if (isWhisperMessage(msg)) {
            await this.handleWhisper(user, msg as WhisperMessage);
        } else if (isHistoryMessage(msg)) {
            this.handleHistory(user, msg as HistoryMessage);
        } else {
            user.sendSystemMessage('未知消息类型！');
        }
    }

    private handleAuth(user: User, msg: AuthMessage): void {
        const nickname = msg.payload.nickname.trim();

        if (!nickname || nickname.length > 20) {
            user.sendError('INVALID_NICKNAME', '昵称长度 1-20 字符');
            return;
        }
        if (this.nicknames.has(nickname)) {
            user.sendError('NICKNAME_TAKEN', '昵称已被占用');
            return;
        }

        user.nickname = nickname;
        user.isAuthenticated = true;
        this.nicknames.set(nickname, user);

        const lobby = this.rooms.get('Lobby')!;
        if (!lobby.addUser(user)) {
            user.sendError('ROOM_FULL', '大厅已满，无法加入');
            return;
        }
        user.currentRoom = 'Lobby';

        user.sendMessage({
            type: MessageType.AUTH_OK,
            payload: { nickname, room: 'Lobby' },
            timestamp: new Date().toISOString(),
            sender: 'system',
            id: uuidv4()
        } as BaseMessage);

        this.broadcast('Lobby', {
            type: MessageType.PRESENCE,
            payload: { nickname, action: 'join', room: 'Lobby' },
            timestamp: new Date().toISOString(),
            sender: 'system',
            id: uuidv4()
        } as BaseMessage, user);
    }

    /** 处理注册请求 */
    private async handleRegister(user: User, msg: RegisterMessage): Promise<void> {
        const { username, password, nickname } = msg.payload;
        const result = await this.authManager.register(username, password, nickname);

        if (!result.success) {
            user.sendMessage({
                type: MessageType.REGISTER_FAIL,
                payload: { reason: result.error! },
                timestamp: new Date().toISOString(),
                sender: 'system',
                id: uuidv4()
            } as BaseMessage);
            return;
        }

        user.sendMessage({
            type: MessageType.REGISTER_OK,
            payload: { userId: result.user!.id, username, nickname: result.user!.nickname },
            timestamp: new Date().toISOString(),
            sender: 'system',
            id: uuidv4()
        } as BaseMessage);

        await this.completeLogin(user, result.user!, result.token!, result.expiresAt!);
    }

    /** 处理登录请求 */
    private async handleLogin(user: User, msg: LoginMessage): Promise<void> {
        const { username, password } = msg.payload;
        const result = await this.authManager.login(username, password);

        if (!result.success) {
            user.sendMessage({
                type: MessageType.LOGIN_FAIL,
                payload: { reason: result.error! },
                timestamp: new Date().toISOString(),
                sender: 'system',
                id: uuidv4()
            } as BaseMessage);
            return;
        }

        user.sendMessage({
            type: MessageType.LOGIN_OK,
            payload: {
                token: result.token!,
                expiresAt: result.expiresAt!,
                user: {
                    id: result.user!.id,
                    username: result.user!.username,
                    nickname: result.user!.nickname,
                    role: result.user!.role,
                }
            },
            timestamp: new Date().toISOString(),
            sender: 'system',
            id: uuidv4()
        } as BaseMessage);

        await this.completeLogin(user, result.user!, result.token!, result.expiresAt!);
    }

    /** Token 认证（重新连接时使用） */
    private async handleTokenAuth(user: User, msg: TokenMessage): Promise<void> {
        const payload = this.authManager.verifyToken(msg.payload.token);
        if (!payload) {
            user.sendMessage({
                type: MessageType.TOKEN_FAIL,
                payload: { reason: 'Token 无效或已过期' },
                timestamp: new Date().toISOString(),
                sender: 'system',
                id: uuidv4()
            } as BaseMessage);
            return;
        }

        const dbUser = this.store.users.findById(payload.userId);
        if (!dbUser) {
            user.sendError('USER_NOT_FOUND', '用户不存在');
            return;
        }

        await this.completeLogin(user, dbUser, msg.payload.token);
    }

    /** 完成登录后的通用逻辑 */
    private async completeLogin(
        user: User,
        dbUser: { id: number; nickname: string; role: string; username: string },
        token: string,
        expiresAt?: number
    ): Promise<void> {
        // 单点登录：踢掉已在线的同名用户
        const existing = this.findOnlineUserByDbId(dbUser.id);
        if (existing) {
            existing.sendSystemMessage('你的账号在别处登录，已被强制下线');
            existing.socket.destroy();
        }

        user.nickname = dbUser.nickname;
        user.databaseUserId = dbUser.id;
        user.role = dbUser.role as UserRole;
        user.isAuthenticated = true;

        this.nicknames.set(dbUser.nickname, user);

        // 加入 Lobby
        const lobby = this.rooms.get('Lobby')!;
        lobby.addUser(user);
        user.currentRoom = 'Lobby';

        user.sendMessage({
            type: MessageType.TOKEN_OK,
            payload: { nickname: dbUser.nickname, room: 'Lobby' },
            timestamp: new Date().toISOString(),
            sender: 'system',
            id: uuidv4()
        } as BaseMessage);

        // 推送离线消息
        const offlineMsgs = this.store.messages.getOfflineMessages(dbUser.id);
        if (offlineMsgs.length > 0) {
            for (const om of offlineMsgs) {
                user.sendMessage({
                    type: MessageType.WHISPER,
                    payload: {
                        target: dbUser.nickname,
                        content: `[离线消息] ${om.senderName}: ${om.content}`
                    },
                    timestamp: new Date(om.createdAt * 1000).toISOString(),
                    sender: om.senderName,
                    id: uuidv4()
                } as BaseMessage);
            }
            this.store.messages.markOfflineDelivered(offlineMsgs.map(m => m.id));
            user.sendSystemMessage(`已收到 ${offlineMsgs.length} 条离线消息`);
        }

        // 广播进入通知
        this.broadcast('Lobby', {
            type: MessageType.PRESENCE,
            payload: { nickname: dbUser.nickname, action: 'join', room: 'Lobby' },
            timestamp: new Date().toISOString(),
            sender: 'system',
            id: uuidv4()
        } as BaseMessage, user);
    }

    /** 根据数据库用户 ID 查找在线用户 */
    private findOnlineUserByDbId(userId: number): User | undefined {
        for (const [, user] of this.nicknames) {
            if (user.databaseUserId === userId) return user;
        }
        return undefined;
    }

    private async handleChat(user: User, msg: ChatMessage): Promise<void> {
        if (user.isMuted()) {
            user.sendError('MUTED', '你已被禁言');
            return;
        }

        const roomName = msg.payload.room || user.currentRoom;
        const room = this.rooms.get(roomName);
        if (!room) {
            user.sendError('ROOM_NOT_FOUND', '房间不存在');
            return;
        }

        const fullMsg: ChatMessage = {
            type: msg.type,
            payload: msg.payload,
            sender: user.nickname,
            timestamp: new Date().toISOString(),
            id: uuidv4()
        };

        // 写入持久化存储（注册用户才持久化）
        if (user.databaseUserId > 0) {
            this.store.messages.addRoomMessage(roomName, {
                senderId: user.databaseUserId,
                senderName: user.nickname,
                room: roomName,
                type: 'CHAT',
                content: msg.payload.content,
                targetId: null,
                createdAt: Math.floor(Date.now() / 1000),
                isOffline: false,
            });

            // 更新用户消息计数
            const currentCount = this.store.users.findById(user.databaseUserId)?.metadata.messageCount || 0;
            this.store.users.updateMetadata(user.databaseUserId, {
                messageCount: currentCount + 1,
            });
        }

        room.addMessage(fullMsg as BaseMessage);
        this.broadcast(roomName, fullMsg as BaseMessage, user);
        user.metadata.messageCount++;
    }

    private async handleWhisper(user: User, msg: WhisperMessage): Promise<void> {
        const target = this.nicknames.get(msg.payload.target);

        const fullMsg: WhisperMessage = {
            type: msg.type,
            payload: msg.payload,
            sender: user.nickname,
            timestamp: new Date().toISOString(),
            id: uuidv4()
        };

        if (target) {
            // 目标在线，直接发送
            this.sendTo(target, fullMsg as BaseMessage);
            // 持久化
            if (user.databaseUserId > 0 && target.databaseUserId > 0) {
                this.store.messages.addWhisper({
                    senderId: user.databaseUserId,
                    senderName: user.nickname,
                    room: '',
                    type: 'WHISPER',
                    content: msg.payload.content,
                    targetId: target.databaseUserId,
                    createdAt: Math.floor(Date.now() / 1000),
                    isOffline: false,
                });
            }
        } else {
            // 目标不在线，存为离线消息
            const targetDbUser = this.store.users.findByNickname(msg.payload.target);
            if (targetDbUser && user.databaseUserId > 0) {
                this.store.messages.addWhisper({
                    senderId: user.databaseUserId,
                    senderName: user.nickname,
                    room: '',
                    type: 'WHISPER',
                    content: msg.payload.content,
                    targetId: targetDbUser.id,
                    createdAt: Math.floor(Date.now() / 1000),
                    isOffline: true,
                });
                user.sendSystemMessage(`用户 ${msg.payload.target} 不在线，消息将在其上线后送达`);
            } else {
                user.sendError('USER_NOT_FOUND', '目标用户不存在或未注册');
            }
        }

        user.sendSystemMessage(`私聊已发送给 ${msg.payload.target}`);
    }

    private handleJoin(user: User, msg: JoinMessage): void {
        const newRoomName = msg.payload.room;
        const oldRoomName = user.currentRoom;

        if (newRoomName === oldRoomName) return;

        let newRoom = this.rooms.get(newRoomName);
        if (!newRoom) {
            newRoom = new Room(newRoomName, { password: msg.payload.password });
            this.rooms.set(newRoomName, newRoom);
            // 持久化新房间（注册用户创建）
            if (user.databaseUserId > 0) {
                this.store.rooms.create({
                    name: newRoomName,
                    passwordHash: msg.payload.password || '',
                    creatorId: user.databaseUserId,
                    config: { maxUsers: 100, isDefault: false },
                });
            }
        }

        if (!newRoom.validatePassword(msg.payload.password || '')) {
            user.sendError('WRONG_PASSWORD', '房间密码错误');
            return;
        }

        if (oldRoomName) {
            const oldRoom = this.rooms.get(oldRoomName);
            if (oldRoom) {
                oldRoom.removeUser(user);
                this.broadcast(oldRoomName, {
                    type: MessageType.PRESENCE,
                    payload: { nickname: user.nickname, action: 'leave', room: oldRoomName },
                    timestamp: new Date().toISOString(),
                    sender: 'system',
                    id: uuidv4()
                } as BaseMessage);
            }
        }

        if (!newRoom.addUser(user)) {
            user.sendError('ROOM_FULL', '房间已满，无法加入');
            return;
        }
        user.currentRoom = newRoomName;

        // 从持久化存储获取历史消息（优先使用持久化，否则用内存）
        if (user.databaseUserId > 0) {
            const history = this.store.messages.getLatestRoomHistory(newRoomName, 20);
            history.forEach(h => {
                user.sendMessage({
                    type: MessageType.CHAT,
                    payload: { content: h.content, room: newRoomName },
                    timestamp: new Date(h.createdAt * 1000).toISOString(),
                    sender: h.senderName,
                    id: uuidv4()
                } as BaseMessage);
            });
        } else {
            const history = newRoom.getMessageHistory(20);
            history.forEach(h => user.sendMessage(h));
        }

        this.broadcast(newRoomName, {
            type: MessageType.PRESENCE,
            payload: { nickname: user.nickname, action: 'join', room: newRoomName },
            timestamp: new Date().toISOString(),
            sender: 'system',
            id: uuidv4()
        } as BaseMessage, user);
    }

    /** 分页历史消息 */
    private handleHistory(user: User, msg: HistoryMessage): void {
        const room = msg.payload.room || user.currentRoom;
        const limit = Math.min(msg.payload.limit || 20, 100);
        const beforeId = msg.payload.beforeId || Number.MAX_SAFE_INTEGER;

        const rows = this.store.messages.getRoomHistory(room, beforeId, limit);

        user.sendMessage({
            type: MessageType.HISTORY_DATA,
            payload: {
                messages: rows.reverse().map(r => ({
                    id: r.id,
                    sender: r.senderName,
                    content: r.content,
                    createdAt: r.createdAt,
                })),
                hasMore: rows.length === limit,
            },
            timestamp: new Date().toISOString(),
            sender: 'system',
            id: uuidv4()
        } as BaseMessage);
    }

    private handleDisconnect(socket: Socket): void {
        const user = this.users.get(socket);
        if (!user || !user.isAuthenticated) {
            this.users.delete(socket);
            socket.destroy();
            return;
        }

        if (user.currentRoom) {
            const room = this.rooms.get(user.currentRoom);
            if (room) {
                room.removeUser(user);
                this.broadcast(user.currentRoom, {
                    type: MessageType.PRESENCE,
                    payload: { 
                        nickname: user.nickname, 
                        action: 'leave', 
                        room: user.currentRoom 
                    },
                    timestamp: new Date().toISOString(),
                    sender: 'system',
                    id: uuidv4()
                } as BaseMessage);
            }
        }

        this.nicknames.delete(user.nickname);
        this.users.delete(socket);
        socket.destroy();
    }

    public broadcast(roomName: string, msg: BaseMessage, exclude?: User): void {
        const room = this.rooms.get(roomName);
        if (!room) return;

        for (const nickname of room.getUserList()) {
            const target = this.nicknames.get(nickname);
            if (!target || target === exclude) continue;
            target.sendMessage(msg);
        }
    }

    public sendTo(user: User, msg: BaseMessage): void {
        user.sendMessage(msg);
    }

    public sendToNickname(nickname: string, msg: BaseMessage): boolean {
        const user = this.nicknames.get(nickname);
        if (!user) return false;
        user.sendMessage(msg);
        return true;
    }
}
