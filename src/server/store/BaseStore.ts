import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

//这个抽象类描绘了一个通用的数据存储机制，
// 提供了加载、写入和备份的功能，
// 子类可以专注于数据结构和业务逻辑，而不必担心底层的文件操作细节。
export abstract class BaseStore<T> {
  protected filePath: string;
  protected data: T;
  private writeTimer: NodeJS.Timeout | null = null;
  protected dirty: boolean = false;// 标记数据是否已修改但尚未写入磁盘
  private readonly debounceMs: number = 500;  // 防抖写入间隔
  /**
   * 什么叫防抖写入：
   * 防抖写入是一种优化策略，旨在减少频繁的数据写入操作，尤
   * 其是在数据可能会频繁修改的情况下。通过设置一个短暂的延迟（如 debounceMs），
   * 当数据被修改时，不会立即写入磁盘，而是等待一段时间。如果在这段时间内数据再次被修改，
   * 之前的写入计划将被取消，并重新开始计时。这样可以确保只有在数据稳定一段时间后才进行写入，
   * 从而减少磁盘操作次数，提高性能。
   * 例如，如果用户在短时间内连续修改了数据，防
   * 抖机制会确保只在最后一次修改后的一段时间内进行一次写入，而不是每次修改都写入一次。
   */

  constructor(filePath: string, defaultData: T) {
    this.filePath = filePath;
    this.data = this.load(defaultData);
  }

  /** 加载数据（启动时调用） */
  protected load(defaultData: T): T {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error(`[Store] 加载 ${this.filePath} 失败:`, e);
      // 尝试从备份恢复
      const backupPath = `${this.filePath}.backup`;
      if (existsSync(backupPath)) {
        console.log(`[Store] 尝试从备份恢复: ${backupPath}`);
        const raw = readFileSync(backupPath, 'utf-8');
        return JSON.parse(raw);
      }
    }
    return defaultData;
  }

  /** 延迟写入（防抖） */
  protected scheduleWrite(): void {
    this.dirty = true;
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flush(), this.debounceMs);
  }

  /** 立即写入 */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      // 1. 确保目录存在
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      // 2. 备份原文件
      if (existsSync(this.filePath)) {
        copyFileSync(this.filePath, `${this.filePath}.backup`);
      }
      // 3. 写入临时文件
      const tmpPath = `${this.filePath}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf-8');
      // 4. 原子重命名
      renameSync(tmpPath, this.filePath);
    } catch (e) {
      console.error(`[Store] 写入 ${this.filePath} 失败:`, e);
    }
  }

  /** 获取当前数据（子类通过此方法访问） */
  protected getData(): T {
    return this.data;
  }

  /** 强制刷新并关闭 */
  close(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.flush();
  }
}
