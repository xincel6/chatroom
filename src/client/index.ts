import { ChatClient } from './client';

const HOST = process.env.CHAT_CLIENT_HOST || 'frp-put.com';
const PORT = parseInt(process.env.CHAT_CLIENT_PORT || '17863', 10);

try {
    new ChatClient(HOST, PORT);
} catch (err) {
    console.error('启动失败:', err);
}