import { ChatClient } from './client';

const HOST = process.env.CHAT_CLIENT_HOST || '127.0.0.1';
const PORT = parseInt(process.env.CHAT_CLIENT_PORT || '3000', 10);

try {
    new ChatClient(HOST, PORT);
} catch (err) {
    console.error('启动失败:', err);
}