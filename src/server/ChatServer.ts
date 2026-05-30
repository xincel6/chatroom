import { createServer, Server, Socket } from "net";
import { User } from "./User";
import { Room } from "./Room";
import { 
    BaseMessage, MessageType, AuthMessage, ChatMessage, WhisperMessage, JoinMessage,
    isAuthMessage, isChatMessage, isJoinMessage, isPongMessage, isWhisperMessage
} from '../shared/protocol';
import { v4 as uuidv4 } from 'uuid';

const HEARTBEAT_INTERVAL = parseInt(process.env.CHAT_HEARTBEAT_INTERVAL || '30000', 10);
const HEARTBEAT_TIMEOUT = parseInt(process.env.CHAT_HEARTBEAT_TIMEOUT || '60000', 10);

export class ChatServer {
    private server: Server;
    private users: Map<Socket, User>;
    private nicknames: Map<string, User>;
    private rooms: Map<string, Room>;
    private port: number;
    private heartbeatTimer: NodeJS.Timeout | null = null;

    constructor(port: number) {
        this.port = port;
        this.server = createServer();
        this.users = new Map();
        this.nicknames = new Map();
        this.rooms = new Map();
        this.rooms.set('Lobby', new Room('Lobby'));
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

    private handleMessage(user: User, msg: BaseMessage): void {
        if (!user.isAuthenticated) {
            if (isAuthMessage(msg)) {
                this.handleAuth(user, msg as AuthMessage);
            } else {
                user.sendSystemMessage('请先认证！');
            }
            return;
        }

        if (isChatMessage(msg)) {
            this.handleChat(user, msg as ChatMessage);
        } else if (isJoinMessage(msg)) {
            this.handleJoin(user, msg as JoinMessage);
        } else if (isPongMessage(msg)) {
            user.recordPong();
        } else if (isWhisperMessage(msg)) {
            this.handleWhisper(user, msg as WhisperMessage);
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

    private handleChat(user: User, msg: ChatMessage): void {
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

        const fullMsg = {
            type: msg.type,
            payload: msg.payload,
            sender: user.nickname,
            timestamp: new Date().toISOString(),
            id: uuidv4()
        } as ChatMessage;

        room.addMessage(fullMsg as BaseMessage);
        this.broadcast(roomName, fullMsg as BaseMessage, user);
        user.metadata.messageCount++;
    }

    private handleWhisper(user: User, msg: WhisperMessage): void {
        const target = this.nicknames.get(msg.payload.target);
        if (!target) {
            user.sendError('USER_NOT_FOUND', '目标用户不在线');
            return;
        }

        const fullMsg = {
            type: msg.type,
            payload: msg.payload,
            sender: user.nickname,
            timestamp: new Date().toISOString(),
            id: uuidv4()
        } as WhisperMessage;

        this.sendTo(target, fullMsg as BaseMessage);
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

        const history = newRoom.getMessageHistory(20);
        history.forEach(h => user.sendMessage(h));

        this.broadcast(newRoomName, {
            type: MessageType.PRESENCE,
            payload: { nickname: user.nickname, action: 'join', room: newRoomName },
            timestamp: new Date().toISOString(),
            sender: 'system',
            id: uuidv4()
        } as BaseMessage, user);
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