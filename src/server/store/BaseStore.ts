import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export abstract class BaseStore<T> {
  protected filePath: string;
  protected data: T;
  private writeTimer: NodeJS.Timeout | null = null;
  protected dirty: boolean = false;
  private readonly debounceMs: number = 500;  // 防抖写入间隔

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
