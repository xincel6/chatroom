import { ChatClient } from './client';

const HOST = process.env.CHAT_CLIENT_HOST || '47.95.232.197';  // ← 改成你的公网IP
const PORT = parseInt(process.env.CHAT_CLIENT_PORT || '3000', 10); // ← 端口不变

try {
    new ChatClient(HOST, PORT);
} catch (err) {
    console.error('启动失败:', err);
}