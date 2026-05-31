import { UserStore } from './UserStore';
import { MessageStore } from './MessageStore';
import { RoomStore } from './RoomStore';

export class StoreManager {
  private static instance: StoreManager;
  readonly users: UserStore;
  readonly messages: MessageStore;
  readonly rooms: RoomStore;

  private constructor(dataDir: string) {
    this.users = new UserStore(`${dataDir}/users.json`);
    this.messages = new MessageStore(`${dataDir}/messages.json`);
    this.rooms = new RoomStore(`${dataDir}/rooms.json`);
  }

  static getInstance(dataDir?: string): StoreManager {
    if (!StoreManager.instance) {
      StoreManager.instance = new StoreManager(
        dataDir || process.env.CHAT_DATA_DIR || './data'
      );
    }
    return StoreManager.instance;
  }

  /** 立即刷新所有 Store */
  flushAll(): void {
    this.users.flush();
    this.messages.flush();
    this.rooms.flush();
  }

  /** 关闭所有 Store */
  close(): void {
    this.users.close();
    this.messages.close();
    this.rooms.close();
    (StoreManager.instance as any) = null;
  }
}
