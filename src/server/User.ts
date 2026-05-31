import { Socket } from 'net';
import { BaseMessage, MessageType } from '../shared/protocol';
import { generateUniqueId } from '../shared/protocol';

export enum UserRole {
    MEMBER = 'MEMBER',
    ADMIN = 'ADMIN',
    MODERATOR = 'MODERATOR',
}

export interface UserMetadata {
    joinTime: Date;
    ip: string;
    messageCount: number;
    lastPongTime: Date;   // 上次心跳回复时间
}

export class User {
    nickname: string;              // 去掉 readonly，认证后再赋值
    readonly socket: Socket;
    role: UserRole;
    metadata: UserMetadata;
    isAuthenticated: boolean = false;
    mutedUnixTime: number = 0;     // 禁言截止时间（时间戳）
    missedPings: number = 0;
    currentRoom: string = '';
    databaseUserId: number = 0;    // 关联 users.json 中的 id，0 表示未关联（游客）
    kickRoom = new Map<string, number>(); // 记录被踢出房间的截止时间

    constructor(socket: Socket, role: UserRole = UserRole.MEMBER) {
        this.nickname = '';
        this.socket = socket;
        this.role = role;
        this.metadata = {
            joinTime: new Date(),
            ip: socket.remoteAddress || 'unknown',
            messageCount: 0,
            lastPongTime: new Date()
        };
    }

    /** 发送任意消息 */
    sendMessage(msg: BaseMessage): boolean {
        try {
            if (this.socket.destroyed || this.socket.closed) return false;
            this.socket.write(JSON.stringify(msg) + '\n');
            return true;
        } catch {
            return false;
        }
    }

    /** 发送系统通知 */
    sendSystemMessage(content: string): void {
        this.sendMessage({
            type: MessageType.SYSTEM,
            payload: { content },
            timestamp: new Date().toISOString(),
            sender: 'system',
            id: generateUniqueId()
        } as BaseMessage);
    }

    /** 发送错误消息 */
    sendError(code: string, message: string): void {
        this.sendMessage({
            type: MessageType.ERROR,
            payload: { code, message },
            timestamp: new Date().toISOString(),
            sender: 'system',
            id: generateUniqueId()
        } as BaseMessage);
    }

    /** 记录心跳回复 */
    recordPong(): void {
        this.metadata.lastPongTime = new Date();
        this.missedPings = 0;
    }

    /** 增加未回复心跳计数 */
    addMissedPing(): void {
        this.missedPings++;
    }

    /** 检查是否被禁言 */
    isMuted(): boolean {
        if (this.mutedUnixTime === 0) return false;
        return Date.now() / 1000 < this.mutedUnixTime;
    }

    /** 禁言用户（秒） */
    mute(seconds: number): void {
        this.mutedUnixTime = Date.now() / 1000 + seconds;
    }

    isKickFromRoom(roomName: string): boolean {
        const kickUntil = this.kickRoom.get(roomName);
        if (!kickUntil) return false;
        if (Date.now() / 1000 > kickUntil) {
            this.kickRoom.delete(roomName); // 已过期，移除记录
            return false;
        }
        return true;
    }

    /** 踢出用户（秒） */
    kickFromRoom(roomName: string, seconds: number): void {
        const kickUntil = Date.now() / 1000 + seconds;
        this.kickRoom.set(roomName, kickUntil);
    }

     /** 解除踢出 */
     unkickFromRoom(roomName: string): void {
        this.kickRoom.delete(roomName);
    }

     /** 解除禁言 */
     unmute(): void {
        this.mutedUnixTime = 0;
    }

    /** 检查心跳是否超时（传入毫秒） */
    isHeartbeatTimedOut(timeoutMs: number): boolean {
        return Date.now() - this.metadata.lastPongTime.getTime() > timeoutMs;
    }

    /** 获取用户公开信息 */
    getInfo() {
        return {
            nickname: this.nickname,
            role: this.role,
            joinTime: this.metadata.joinTime,
            messageCount: this.metadata.messageCount
        };
    }
}