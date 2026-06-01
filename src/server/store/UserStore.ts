import { BaseStore } from './BaseStore';
import { UserRecord } from '../../shared/types';

interface UsersData {
  version: number;
  lastId: number;
  users: UserRecord[];
}

export class UserStore extends BaseStore<UsersData> {
  private indexByUsername: Map<string, UserRecord> = new Map();
  private indexByNickname: Map<string, UserRecord> = new Map();
  private indexById: Map<number, UserRecord> = new Map();
  private indexByEmail: Map<string, UserRecord> = new Map();

  constructor(filePath: string) {
    super(filePath, { version: 1, lastId: 0, users: [] });
    this.buildIndexes();
  }

  /** 构建内存索引（启动时调用一次） */
  private buildIndexes(): void {
    for (const user of this.data.users) {
      this.indexByUsername.set(user.username, user);
      this.indexByNickname.set(user.nickname, user);
      this.indexById.set(user.id, user);
      if (user.email) {
        this.indexByEmail.set(user.email, user);
      }
    }
  }

  /** 创建用户 */
  create(input: Omit<UserRecord, 'id' | 'createdAt'> & { createdAt?: number }): UserRecord {
    this.data.lastId++;
    const user: UserRecord = {
      id: this.data.lastId,
      username: input.username,
      passwordHash: input.passwordHash,
      nickname: input.nickname,
      email: input.email || '',
      role: input.role || 'MEMBER',
      createdAt: input.createdAt || Math.floor(Date.now() / 1000),
      lastLoginAt: null,
      metadata: input.metadata || { messageCount: 0, totalOnlineMinutes: 0 },
    };
    this.data.users.push(user);
    // 更新索引
    this.indexByUsername.set(user.username, user);
    this.indexByNickname.set(user.nickname, user);
    this.indexById.set(user.id, user);
    if (user.email) {
      this.indexByEmail.set(user.email, user);
    }
    this.scheduleWrite();
    return user;
  }

  /** 根据用户名查找 */
  findByUsername(username: string): UserRecord | undefined {
    return this.indexByUsername.get(username);
  }

  /** 根据昵称查找 */
  findByNickname(nickname: string): UserRecord | undefined {
    return this.indexByNickname.get(nickname);
  }

  /** 根据 ID 查找 */
  findById(id: number): UserRecord | undefined {
    return this.indexById.get(id);
  }

  /** 检查用户名是否存在 */
  usernameExists(username: string): boolean {
    return this.indexByUsername.has(username);
  }

  /** 检查昵称是否存在 */
  nicknameExists(nickname: string): boolean {
    return this.indexByNickname.has(nickname);
  }

  /** 更新最后登录时间 */
  updateLastLogin(userId: number): void {
    const user = this.indexById.get(userId);
    if (user) {
      user.lastLoginAt = Math.floor(Date.now() / 1000);
      this.scheduleWrite();
    }
  }

  /** 更新用户元数据 */
  updateMetadata(userId: number, metadata: Partial<UserRecord['metadata']>): void {
    const user = this.indexById.get(userId);
    if (user) {
      user.metadata = { ...user.metadata, ...metadata };
      this.scheduleWrite();
    }
  }

  /** 获取所有用户数量 */
  getCount(): number {
    return this.data.users.length;
  }

  /** 获取所有用户列表 */
  getAll(): UserRecord[] {
    return [...this.data.users];
  }

  /** 删除用户 */
  delete(userId: number): boolean {
    const idx = this.data.users.findIndex(u => u.id === userId);
    if (idx === -1) return false;
    const user = this.data.users[idx];
    this.data.users.splice(idx, 1);
    this.indexByUsername.delete(user.username);
    this.indexByNickname.delete(user.nickname);
    this.indexById.delete(user.id);
    this.scheduleWrite();
    return true;
  }

  /** 更新用户角色 */
  updateRole(userId: number, role: UserRecord['role']): boolean {
    const user = this.indexById.get(userId);
    if (!user) return false;
    user.role = role;
    this.scheduleWrite();
    return true;
  }

  /** 检查邮箱是否已存在 */
  emailExists(email: string): boolean {
    return this.indexByEmail.has(email);
  }

  /** 根据邮箱查找用户 */
  findByEmail(email: string): UserRecord | undefined {
    return this.indexByEmail.get(email);
  }
}
