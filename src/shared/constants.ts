// 数据存储目录路径、Token 过期时间等常量

export const DATA_DIR = process.env.CHAT_DATA_DIR || './data';
export const JWT_SECRET = process.env.CHAT_JWT_SECRET || 'your-secret-key-here-change-in-production';
export const TOKEN_EXPIRY = parseInt(process.env.CHAT_TOKEN_EXPIRY || '86400', 10); // 默认 24 小时
export const BCRYPT_ROUNDS = parseInt(process.env.CHAT_BCRYPT_ROUNDS || '12', 10);

export const MAX_ROOM_MESSAGES = 5000;
export const MAX_WHISPER_MESSAGES = 2000;
export const HISTORY_PAGE_SIZE = 20;
export const MAX_HISTORY_PAGE_SIZE = 100;
