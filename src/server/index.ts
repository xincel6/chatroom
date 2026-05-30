import * as dotenv from 'dotenv';
dotenv.config();

import {ChatServer} from './ChatServer';

const PORT = parseInt(process.env.CHAT_SERVER_PORT || '3000', 10);
const server = new ChatServer(PORT);
server.start();