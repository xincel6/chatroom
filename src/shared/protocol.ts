//消息类型枚举
export enum MessageType{
    AUTH = 'AUTH'             ,//客户端认证名称
    AUTH_OK = 'AUTH_OK'       ,//认证成功
    AUTH_FAIL = 'AUTH_FAIL'   ,//认证失败，名称重复等
    //连接认证

    CHAT = 'CHAT'             ,//聊天室类型消息
    WHISPER = 'WHISPER'       ,//私聊消息   
    SYSTEM = 'SYSTEM'         ,//系统消息
    //聊天信息枚举

    JOIN = 'JOIN'             ,//加入房间
    LEAVE = 'LEAVE'           ,//离开房间
    ROOM_LIST = 'ROOM_LIST'   ,//房间列表
    //房间管理

    COMMAND = 'COMMAND'       ,//命令请求
    LIST = 'LIST'             ,//在线请求
    USER_LIST = 'USER_LIST'   ,//在线列表响应

    CMD_RESULT = 'CMD_RESULT' ,//命令执行结果
    //命令相关

    MUTE = 'MUTE'             ,//禁言用户
    UNMUTE = 'UNMUTE'         ,//解除禁言
    KICK = 'KICK'             ,//踢出用户
    BAN = 'BAN'               ,//封禁用户
    UNBAN = 'UNBAN'           ,//解除封禁
    //管理操作

    PING = 'PING'             ,//服务端心跳
    PONG = 'PONG'             ,//客户端心跳
    //心跳相关

    FILE_OFFER = 'FILE_OFFER' ,//发起文件传输
    FILE_CHUNK = 'FILE_CHUNK' ,//文件分片
    FILE_ACK = 'FILE_ACK'     ,//文件接收确认通知

    PRESENCE = 'PRESENCE'     ,//用户上下线通知
    ERROR = 'ERROR'           ,//错误消息
    //状态

    // === 新增：注册登录体系 ===
    REGISTER = 'REGISTER',           // 注册请求
    REGISTER_OK = 'REGISTER_OK',     // 注册成功
    REGISTER_FAIL = 'REGISTER_FAIL', // 注册失败

    LOGIN = 'LOGIN',                 // 登录请求
    LOGIN_OK = 'LOGIN_OK',           // 登录成功（返回 Token）
    LOGIN_FAIL = 'LOGIN_FAIL',       // 登录失败

    TOKEN = 'TOKEN',                 // Token 认证（替代旧 AUTH）
    TOKEN_OK = 'TOKEN_OK',
    TOKEN_FAIL = 'TOKEN_FAIL',

    HISTORY = 'HISTORY',             // 请求历史消息
    HISTORY_DATA = 'HISTORY_DATA',   // 历史消息响应

    SYNC = 'SYNC',                   // 云端同步请求
    SYNC_OK = 'SYNC_OK',             // 同步成功
}

/** 统一消息接口 */
export interface BaseMessage {
  type: MessageType;    
  payload: unknown;    //内容
  timestamp: string;   // 时间
  sender: string;      // 发送者昵称或 'system'
  id: string;          // 消息唯一 ID (uuid)
}

/** 认证消息 */
export interface AuthMessage extends BaseMessage {
  type: MessageType.AUTH;
  payload: { 
    nickname: string ; //名称
    password?: string ;//密码
  };
}
export interface AuthOkMessage extends BaseMessage {
  type: MessageType.AUTH_OK;
  payload: { nickname: string; room: string };
}
export interface AuthFailMessage extends BaseMessage {
  type: MessageType.AUTH_FAIL;
  payload: { reason: string };
}

/** 聊天消息 */
export interface ChatMessage extends BaseMessage {
  type: MessageType.CHAT;
  payload: {
    content: string;     
    room: string;
    encrypted?: boolean;  // 是否加密
  };
}

/** 私聊消息 */
export interface WhisperMessage extends BaseMessage {
  type: MessageType.WHISPER;
  payload: {
    target: string;    // 目标用户昵称
    content: string;
  };
}

/** 系统通知 */
export interface SystemMessage extends BaseMessage {
  type: MessageType.SYSTEM;
  payload: {
    content: string;
    level?: 'info' | 'warning' | 'error';
    //消息等级
  };
}

/** 房间操作  */
//加入
export interface JoinMessage extends BaseMessage {
  type: MessageType.JOIN;
  payload: { 
    room: string; 
    password?: string 
  };
}
//离开
export interface LeaveMessage extends BaseMessage {
  type: MessageType.LEAVE;
  payload: { room: string };
}
//房间列表响应
export interface RoomListMessage extends BaseMessage {
  type: MessageType.ROOM_LIST;
  payload: {
    rooms: { name: string; userCount: number; hasPassword: boolean }[];
  };
}



/** 心跳消息 */
//心跳检测
export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
  payload: { timestamp: number };
}
//心跳回复
export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
  payload: { timestamp: number };
}

/** 文件传输 */
export interface FileOfferMessage extends BaseMessage {
  type: MessageType.FILE_OFFER;
  payload: {
    filename: string;
    size: number;
    chunkCount: number;
    target?: string;  // 不传则为广播
  };
}
export interface FileChunkMessage extends BaseMessage {
  type: MessageType.FILE_CHUNK;
  payload: {
    offerId: string;   // 对应哪次文件传输
    index: number;     // 第几个分片
    data: string;      // Base64 编码的数据
    isLast: boolean;   // 是否最后一个分片
  };
}
export interface FileAckMessage extends BaseMessage {
  type: MessageType.FILE_ACK;
  payload: {
    offerId: string;
    index: number;     // 确认收到第几个分片
  };
}

/**命令 */
//  在线列表请求
export interface ListMessage extends BaseMessage {
  type: MessageType.LIST;
  payload: { room?: string }; // 查询某个房间，不传查全部
}

// 在线列表响应
export interface UserListMessage extends BaseMessage {
  type: MessageType.USER_LIST;
  payload: { users: { nickname: string; room: string; status: string }[] };
}
// 命令执行结果
export interface CmdResultMessage extends BaseMessage {
  type: MessageType.CMD_RESULT;
  payload: {
    command: string;
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

/** 错误消息 */
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  payload: { code: string; message: string };
}

// === 新增：注册登录相关消息接口 ===

/** 注册请求 */
export interface RegisterMessage extends BaseMessage {
  type: MessageType.REGISTER;
  payload: {
    username: string;      // 登录用户名（英文+数字，3-20位）
    password: string;      // 密码（6-32位）
    nickname: string;      // 显示昵称（1-20位）
  };
}

/** 注册响应 */
export interface RegisterOkMessage extends BaseMessage {
  type: MessageType.REGISTER_OK;
  payload: {
    userId: number;
    username: string;
    nickname: string;
  };
}
export interface RegisterFailMessage extends BaseMessage {
  type: MessageType.REGISTER_FAIL;
  payload: { reason: string };
}

/** 登录请求 */
export interface LoginMessage extends BaseMessage {
  type: MessageType.LOGIN;
  payload: {
    username: string;
    password: string;
  };
}

/** 登录响应 */
export interface LoginOkMessage extends BaseMessage {
  type: MessageType.LOGIN_OK;
  payload: {
    token: string;          // JWT Token
    expiresAt: number;      // 过期时间戳
    user: {
      id: number;
      username: string;
      nickname: string;
      role: string;
    };
  };
}
export interface LoginFailMessage extends BaseMessage {
  type: MessageType.LOGIN_FAIL;
  payload: { reason: string };
}

/** Token 认证（重新连接时使用） */
export interface TokenMessage extends BaseMessage {
  type: MessageType.TOKEN;
  payload: {
    token: string;          // 之前登录获取的 JWT Token
  };
}

/** Token 认证成功 */
export interface TokenOkMessage extends BaseMessage {
  type: MessageType.TOKEN_OK;
  payload: {
    nickname: string;
    room: string;
  };
}

/** Token 认证失败 */
export interface TokenFailMessage extends BaseMessage {
  type: MessageType.TOKEN_FAIL;
  payload: { reason: string };
}

/** 历史消息请求 */
export interface HistoryMessage extends BaseMessage {
  type: MessageType.HISTORY;
  payload: {
    room: string;
    beforeId?: number;      // 游标分页：从此 ID 之前加载
    limit?: number;         // 默认 20，最大 100
  };
}

/** 历史消息响应 */
export interface HistoryDataMessage extends BaseMessage {
  type: MessageType.HISTORY_DATA;
  payload: {
    messages: {
      id: number;
      sender: string;
      content: string;
      createdAt: number;
    }[];
    hasMore: boolean;        // 是否还有更多消息
  };
}

/**用户上下线通知（PRESENCE）*/
export interface PresenceMessage extends BaseMessage {
  type: MessageType.PRESENCE;
  payload: {
    nickname: string;
    action: 'join' | 'leave';
    room: string;
  };
}






/** 通用命令消息（管理操作统一通道） */
export interface CommandMessage extends BaseMessage {
  type: MessageType.COMMAND;
  payload: {
    command: string;
    target?: string;
    room?: string;
    duration?: number;
    role?: string;
    keyword?: string;
  };
}

import { v4 as uuidv4 } from 'uuid';
export function generateUniqueId(): string {
  return uuidv4();
}


/** ==================== 类型守卫函数 ==================== */

// 认证相关
export function isAuthMessage(msg: BaseMessage): msg is AuthMessage {
  return msg.type === MessageType.AUTH;
}

export function isAuthOkMessage(msg: BaseMessage): msg is AuthOkMessage {
  return msg.type === MessageType.AUTH_OK;
}

export function isAuthFailMessage(msg: BaseMessage): msg is AuthFailMessage {
  return msg.type === MessageType.AUTH_FAIL;
}

// 聊天相关
export function isChatMessage(msg: BaseMessage): msg is ChatMessage {
  return msg.type === MessageType.CHAT;
}

export function isWhisperMessage(msg: BaseMessage): msg is WhisperMessage {
  return msg.type === MessageType.WHISPER;
}

export function isSystemMessage(msg: BaseMessage): msg is SystemMessage {
  return msg.type === MessageType.SYSTEM;
}

// 房间相关
export function isJoinMessage(msg: BaseMessage): msg is JoinMessage {
  return msg.type === MessageType.JOIN;
}

export function isLeaveMessage(msg: BaseMessage): msg is LeaveMessage {
  return msg.type === MessageType.LEAVE;
}

export function isRoomListMessage(msg: BaseMessage): msg is RoomListMessage {
  return msg.type === MessageType.ROOM_LIST;
}

// 命令与列表相关
export function isListMessage(msg: BaseMessage): msg is ListMessage {
  return msg.type === MessageType.LIST;
}

export function isUserListMessage(msg: BaseMessage): msg is UserListMessage {
  return msg.type === MessageType.USER_LIST;
}

export function isCmdResultMessage(msg: BaseMessage): msg is CmdResultMessage {
  return msg.type === MessageType.CMD_RESULT;
}

// 心跳相关
export function isPingMessage(msg: BaseMessage): msg is PingMessage {
  return msg.type === MessageType.PING;
}

export function isPongMessage(msg: BaseMessage): msg is PongMessage {
  return msg.type === MessageType.PONG;
}

// 文件传输相关
export function isFileOfferMessage(msg: BaseMessage): msg is FileOfferMessage {
  return msg.type === MessageType.FILE_OFFER;
}

export function isFileChunkMessage(msg: BaseMessage): msg is FileChunkMessage {
  return msg.type === MessageType.FILE_CHUNK;
}

export function isFileAckMessage(msg: BaseMessage): msg is FileAckMessage {
  return msg.type === MessageType.FILE_ACK;
}

// 状态与错误
export function isPresenceMessage(msg: BaseMessage): msg is PresenceMessage {
  return msg.type === MessageType.PRESENCE;
}

export function isErrorMessage(msg: BaseMessage): msg is ErrorMessage {
  return msg.type === MessageType.ERROR;
}

// 命令相关
export function isCommandMessage(msg: BaseMessage): msg is CommandMessage {
  return msg.type === MessageType.COMMAND;
}

// === 新增类型守卫 ===
export function isRegisterMessage(msg: BaseMessage): msg is RegisterMessage {
  return msg.type === MessageType.REGISTER;
}
export function isLoginMessage(msg: BaseMessage): msg is LoginMessage {
  return msg.type === MessageType.LOGIN;
}
export function isTokenMessage(msg: BaseMessage): msg is TokenMessage {
  return msg.type === MessageType.TOKEN;
}
export function isHistoryMessage(msg: BaseMessage): msg is HistoryMessage {
  return msg.type === MessageType.HISTORY;
}

