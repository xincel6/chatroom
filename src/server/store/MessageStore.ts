import { BaseStore } from './BaseStore';
import { MessageRecord } from '../../shared/types';
import { MAX_ROOM_MESSAGES, MAX_WHISPER_MESSAGES } from '../../shared/constants';

interface RoomMessages {
  totalMessages: number;
  messages: MessageRecord[];
}

interface MessagesData {
  version: number;
  lastId: number;
  rooms: Record<string, RoomMessages>;
  whispers: MessageRecord[];
}

export class MessageStore extends BaseStore<MessagesData> {
  constructor(filePath: string) {
    super(filePath, { version: 1, lastId: 0, rooms: {}, whispers: [] });
  }

  /** 添加房间消息 */
  addRoomMessage(room: string, msg: Omit<MessageRecord, 'id'>): MessageRecord {
    this.data.lastId++;
    const record: MessageRecord = { ...msg, id: this.data.lastId };
    // 初始化房间消息桶
    if (!this.data.rooms[room]) {
      this.data.rooms[room] = { totalMessages: 0, messages: [] };
    }
    this.data.rooms[room].messages.push(record);
    this.data.rooms[room].totalMessages++;
    // 控制单房间消息数量（保留最近 N 条）
    if (this.data.rooms[room].messages.length > MAX_ROOM_MESSAGES) {
      this.data.rooms[room].messages = this.data.rooms[room].messages.slice(-MAX_ROOM_MESSAGES);
    }
    this.scheduleWrite();
    return record;
  }

  /** 添加私聊消息 */
  addWhisper(msg: Omit<MessageRecord, 'id'>): MessageRecord {
    this.data.lastId++;
    const record: MessageRecord = { ...msg, id: this.data.lastId };
    this.data.whispers.push(record);
    // 控制私聊消息总数
    if (this.data.whispers.length > MAX_WHISPER_MESSAGES) {
      this.data.whispers = this.data.whispers.slice(-MAX_WHISPER_MESSAGES);
    }
    this.scheduleWrite();
    return record;
  }

  /** 分页获取房间历史消息（游标分页） */
  getRoomHistory(room: string, beforeId: number, limit: number): MessageRecord[] {
    const bucket = this.data.rooms[room];
    if (!bucket || bucket.messages.length === 0) return [];
    // 找到 beforeId 的索引
    const idx = bucket.messages.findIndex(m => m.id >= beforeId);
    const endIdx = idx === -1 ? bucket.messages.length : idx;
    const startIdx = Math.max(0, endIdx - limit);
    return bucket.messages.slice(startIdx, endIdx);
  }

  /** 获取房间最新消息 */
  getLatestRoomHistory(room: string, limit: number): MessageRecord[] {
    const bucket = this.data.rooms[room];
    if (!bucket || bucket.messages.length === 0) return [];
    return bucket.messages.slice(-limit);
  }

  /** 获取用户的离线消息 */
  getOfflineMessages(userId: number): MessageRecord[] {
    return this.data.whispers.filter(
      w => w.targetId === userId && w.isOffline
    );
  }

  /** 标记离线消息为已投递 */
  markOfflineDelivered(messageIds: number[]): void {
    const idSet = new Set(messageIds);
    for (const w of this.data.whispers) {
      if (idSet.has(w.id)) {
        w.isOffline = false;
      }
    }
    this.scheduleWrite();
  }

  /** 按关键词搜索房间消息 */
  search(room: string, keyword: string, limit: number = 50): MessageRecord[] {
    const bucket = this.data.rooms[room];
    if (!bucket) return [];
    const results: MessageRecord[] = [];
    // 从后往前搜索（最新的优先）
    for (let i = bucket.messages.length - 1; i >= 0; i--) {
      if (bucket.messages[i].content.includes(keyword)) {
        results.push(bucket.messages[i]);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  /** 归档旧消息（超过阈值时调用） */
  archiveOldMessages(room: string, keepCount: number = 3000): number {
    const bucket = this.data.rooms[room];
    if (!bucket || bucket.messages.length <= keepCount) return 0;
    const archived = bucket.messages.slice(0, bucket.messages.length - keepCount);
    bucket.messages = bucket.messages.slice(-keepCount);
    this.scheduleWrite();
    return archived.length;
  }
}
