# Chatroom

一个基于 TCP 的聊天室应用，使用 TypeScript 和 Node.js 构建，支持用户注册/登录、房间管理、私聊、历史消息、管理员操作等功能。

## 功能特性

- **用户系统**：注册、登录、游客登录、密码找回（邮箱验证码）
- **房间管理**：创建/加入/离开房间、房间密码、 Lobby 大厅
- **消息系统**：群聊、私聊、历史消息分页加载、离线消息
- **管理员功能**：踢人、禁言、封禁、删除房间、修改角色、消息搜索
- **数据持久化**：用户、房间、消息均持久化存储到本地 JSON 文件
- **心跳检测**：自动检测客户端在线状态
- **邮件服务**：支持 QQ 邮箱 SMTP 发送验证码

## 快速启动

### 方式一：一键启动（推荐 Windows 用户）

双击运行 `start.bat`：

```
start.bat
```

首次运行会自动完成：
1. 检测并安装 Node.js（无需管理员权限，便携版）
2. 安装 npm 依赖
3. 编译 TypeScript
4. 生成默认配置文件
5. 启动服务端和客户端

### 方式二：PowerShell 脚本

```powershell
.\start.ps1
```

### 方式三：Shell 脚本（支持 Git Bash / WSL / macOS / Linux）

```bash
chmod +x start.sh
./start.sh
```

### 方式四：手动启动

需要先安装 Node.js v20+，然后：

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 复制环境配置
cp .env.example .env

# 启动服务端
npm run start:server

# 在另一个终端启动客户端
npm run start:client
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `start.bat` | Windows 一键启动脚本（自动安装环境+依赖+编译+启动） |
| `start.ps1` | PowerShell 一键启动脚本 |
| `start.sh` | 跨平台 Shell 一键启动脚本 |
| `start-server.bat` | 仅启动服务端 |
| `start-client.bat` | 仅启动客户端 |

## 客户端命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/quit` | 退出客户端 |
| `/w <昵称> <内容>` | 发送私聊 |
| `/join <房间名> [密码]` | 加入或创建房间 |
| `/history` | 加载历史消息 |
| `/more` | 加载更多历史消息 |
| `/admin kick <昵称> <房间>` | 踢出用户（管理员） |
| `/admin mute <昵称> <分钟>` | 禁言用户（管理员） |
| `/admin ban <昵称>` | 封禁用户（管理员） |

## 项目结构

```
chatroom/
  src/
    shared/           # 共享类型和协议
      protocol.ts     # 消息协议、类型定义
      types.ts        # 数据库模型类型
      constants.ts    # 常量配置
    server/           # 服务端代码
      index.ts        # 服务端入口
      ChatServer.ts   # 核心服务器
      User.ts         # 用户实体
      Room.ts         # 房间实体
      auth/           # 认证模块
        AuthManager.ts
        PasswordService.ts
        TokenService.ts
        VerifyCodeService.ts
      mail.ts         # 邮件服务
      store/          # 数据存储
        StoreManager.ts
        BaseStore.ts
        UserStore.ts
        MessageStore.ts
        RoomStore.ts
    client/           # 客户端代码
      index.ts        # 客户端入口
      client.ts       # 客户端逻辑
```

## 环境变量

复制 `.env.example` 为 `.env` 后，按需修改配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CHAT_SERVER_PORT` | 服务端端口 | 3000 |
| `CHAT_DATA_DIR` | 数据存储目录 | ./data |
| `CHAT_JWT_SECRET` | JWT 密钥 | your-secret-key... |
| `CHAT_EMAIL_HOST` | 邮箱 SMTP 地址 | - |
| `CHAT_EMAIL_PASS` | 邮箱授权码 | - |

## 技术栈

- **TypeScript** - 类型安全的 JavaScript 超集
- **Node.js** - 服务端运行时
- **TCP Socket** - 基于 net 模块的自定义协议通信
- **bcryptjs** - 密码哈希
- **jsonwebtoken** - JWT Token 认证
- **nodemailer** - 邮件发送
- **uuid** - 唯一 ID 生成

## License

MIT
