import { BaseStore } from './BaseStore';
import { RoomRecord } from '../../shared/types';

interface RoomsData {
  version: number;
  rooms: RoomRecord[];
}

export class RoomStore extends BaseStore<RoomsData> {
  private indexByName: Map<string, RoomRecord> = new Map();

  constructor(filePath: string) {
    super(filePath, { version: 1, rooms: [] });
    this.buildIndex();
  }

  private buildIndex(): void {
    for (const room of this.data.rooms) {
      this.indexByName.set(room.name, room);
    }
  }

  /** 创建房间 */
  create(record: Omit<RoomRecord, 'createdAt'> & { createdAt?: number }): RoomRecord {
    const room: RoomRecord = {
      ...record,
      createdAt: record.createdAt || Math.floor(Date.now() / 1000),
    };
    this.data.rooms.push(room);
    this.indexByName.set(room.name, room);
    this.scheduleWrite();
    return room;
  }

  /** 根据名称查找 */
  findByName(name: string): RoomRecord | undefined {
    return this.indexByName.get(name);
  }

  /** 检查房间是否存在 */
  exists(name: string): boolean {
    return this.indexByName.has(name);
  }

  /** 获取所有房间列表 */
  getAll(): RoomRecord[] {
    return [...this.data.rooms];
  }

  /** 删除房间 */
  delete(name: string): boolean {
    const idx = this.data.rooms.findIndex(r => r.name === name);
    if (idx === -1) return false;
    this.data.rooms.splice(idx, 1);
    this.indexByName.delete(name);
    this.scheduleWrite();
    return true;
  }
}
