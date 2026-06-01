// 数据库模型类型定义（共享类型，服务端和协议层可用）

export type UserRole = 'MEMBER' | 'ADMIN' | 'MODERATOR';

export interface UserRecord {
  id: number;
  username: string;
  passwordHash: string;
  nickname: string;
  role: UserRole;
  createdAt: number;       // Unix 秒级时间戳
  lastLoginAt: number | null;
  metadata: {
    messageCount: number;
    totalOnlineMinutes: number;
  };
}

export interface MessageRecord {
  id: number;
  senderId: number | null;     // null 表示系统消息
  senderName: string;
  room: string;                // "" 表示私聊
  type: 'CHAT' | 'WHISPER' | 'SYSTEM';
  content: string;
  targetId: number | null;     // 私聊目标用户 ID
  createdAt: number;
  isOffline: boolean;          // true = 离线消息
}

export interface RoomRecord {
  name: string;
  passwordHash: string;
  creatorId: number;
  createdAt: number;
  config: {
    maxUsers: number;
    isDefault: boolean;
  };
}
