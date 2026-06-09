#!/usr/bin/env bash
#
# 聊天室一键启动器（跨平台 Shell 脚本）
# 支持：Git Bash、WSL、macOS、Linux
# 功能：自动检测/安装 Node.js、自动安装依赖、自动编译、自动启动
#
set -euo pipefail

# 切换到脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
PROJECT_ROOT="$PWD"

RUNTIME_DIR="$PROJECT_ROOT/.runtime"
NODE_DIR="$RUNTIME_DIR/node"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_ok()  { echo -e "${GREEN}[OK]${NC} $1"; }
print_info(){ echo -e "${YELLOW}[INFO]${NC} $1"; }
print_err() { echo -e "${RED}[ERROR]${NC} $1"; }
print_step(){ echo -e "${BLUE}========================================${NC}"; echo -e "${BLUE}$1${NC}"; echo -e "${BLUE}========================================${NC}"; }

# 判断平台
IS_WIN=false
IS_MAC=false
IS_LINUX=false

if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "linux" ]]; then
    IS_LINUX=true
elif [[ "$OSTYPE" == "darwin"* ]]; then
    IS_MAC=true
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    IS_WIN=true
fi

# Node 可执行文件和 npm 路径
NODE_VERSION_REMOTE="v20.17.0"

if [[ "$IS_WIN" == true ]]; then
    NODE_EXE="$NODE_DIR/node.exe"
    NPM_CLI="$NODE_DIR/node_modules/npm/bin/npm-cli.js"
    export PATH="$NODE_DIR:$PATH"
else
    NODE_EXE="$NODE_DIR/bin/node"
    NPM_CLI="$NODE_DIR/lib/node_modules/npm/bin/npm-cli.js"
    export PATH="$NODE_DIR/bin:$PATH"
fi

NODE_VERSION=""
NODE_CMD=""
NPM_CMD=""

print_step "        聊天室一键启动器"
echo ""

# ==================== 1. 检查 Node.js ====================
if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v)
    print_ok "检测到系统 Node.js $NODE_VERSION"
    NODE_CMD="node"
    NPM_CMD="npm"
elif [[ -x "$NODE_EXE" ]]; then
    NODE_VERSION=$("$NODE_EXE" -v)
    print_ok "检测到便携 Node.js $NODE_VERSION"
    NODE_CMD="$NODE_EXE"
    NPM_CMD="$NODE_EXE \"$NPM_CLI\""
else
    print_info "未检测到 Node.js，正在自动下载安装..."
    mkdir -p "$RUNTIME_DIR"

    if [[ "$IS_WIN" == true ]]; then
        # Git Bash on Windows - download portable zip
        NODE_DIST="node-${NODE_VERSION_REMOTE}-win-x64"
        NODE_ARCHIVE="${NODE_DIST}.zip"
        NODE_DOWNLOAD_URL="https://nodejs.org/dist/${NODE_VERSION_REMOTE}/${NODE_ARCHIVE}"
        NODE_ARCHIVE_PATH="$RUNTIME_DIR/$NODE_ARCHIVE"

        print_info "正在下载 Node.js ($NODE_ARCHIVE)..."
        if command -v curl &>/dev/null; then
            curl -fsSL "$NODE_DOWNLOAD_URL" -o "$NODE_ARCHIVE_PATH" || { print_err "Node.js 下载失败"; exit 1; }
        elif command -v wget &>/dev/null; then
            wget -q "$NODE_DOWNLOAD_URL" -O "$NODE_ARCHIVE_PATH" || { print_err "Node.js 下载失败"; exit 1; }
        else
            print_err "需要 curl 或 wget 来下载 Node.js"
            exit 1
        fi

        print_info "正在解压 Node.js..."
        unzip -q "$NODE_ARCHIVE_PATH" -d "$RUNTIME_DIR" || { print_err "解压失败"; exit 1; }
        mv "$RUNTIME_DIR/$NODE_DIST" "$NODE_DIR"
        rm -f "$NODE_ARCHIVE_PATH"

    elif [[ "$IS_LINUX" == true ]]; then
        NODE_DIST="node-${NODE_VERSION_REMOTE}-linux-x64"
        NODE_ARCHIVE="${NODE_DIST}.tar.xz"
        NODE_DOWNLOAD_URL="https://nodejs.org/dist/${NODE_VERSION_REMOTE}/${NODE_ARCHIVE}"
        NODE_ARCHIVE_PATH="$RUNTIME_DIR/$NODE_ARCHIVE"

        print_info "正在下载 Node.js ($NODE_ARCHIVE)..."
        if command -v curl &>/dev/null; then
            curl -fsSL "$NODE_DOWNLOAD_URL" -o "$NODE_ARCHIVE_PATH" || { print_err "Node.js 下载失败"; exit 1; }
        elif command -v wget &>/dev/null; then
            wget -q "$NODE_DOWNLOAD_URL" -O "$NODE_ARCHIVE_PATH" || { print_err "Node.js 下载失败"; exit 1; }
        else
            print_err "需要 curl 或 wget 来下载 Node.js"
            exit 1
        fi

        print_info "正在解压 Node.js..."
        tar -xf "$NODE_ARCHIVE_PATH" -C "$RUNTIME_DIR" || { print_err "解压失败"; exit 1; }
        mv "$RUNTIME_DIR/$NODE_DIST" "$NODE_DIR"
        rm -f "$NODE_ARCHIVE_PATH"

    elif [[ "$IS_MAC" == true ]]; then
        if [[ $(uname -m) == "arm64" ]]; then
            NODE_DIST="node-${NODE_VERSION_REMOTE}-darwin-arm64"
        else
            NODE_DIST="node-${NODE_VERSION_REMOTE}-darwin-x64"
        fi
        NODE_ARCHIVE="${NODE_DIST}.tar.gz"
        NODE_DOWNLOAD_URL="https://nodejs.org/dist/${NODE_VERSION_REMOTE}/${NODE_ARCHIVE}"
        NODE_ARCHIVE_PATH="$RUNTIME_DIR/$NODE_ARCHIVE"

        print_info "正在下载 Node.js ($NODE_ARCHIVE)..."
        if command -v curl &>/dev/null; then
            curl -fsSL "$NODE_DOWNLOAD_URL" -o "$NODE_ARCHIVE_PATH" || { print_err "Node.js 下载失败"; exit 1; }
        elif command -v wget &>/dev/null; then
            wget -q "$NODE_DOWNLOAD_URL" -O "$NODE_ARCHIVE_PATH" || { print_err "Node.js 下载失败"; exit 1; }
        else
            print_err "需要 curl 或 wget 来下载 Node.js"
            exit 1
        fi

        print_info "正在解压 Node.js..."
        tar -xzf "$NODE_ARCHIVE_PATH" -C "$RUNTIME_DIR" || { print_err "解压失败"; exit 1; }
        mv "$RUNTIME_DIR/$NODE_DIST" "$NODE_DIR"
        rm -f "$NODE_ARCHIVE_PATH"
    else
        print_err "不支持的操作系统: $OSTYPE"
        print_err "请手动安装 Node.js v20+： https://nodejs.org/"
        exit 1
    fi

    if [[ ! -x "$NODE_EXE" ]]; then
        print_err "Node.js 安装后未找到可执行文件: $NODE_EXE"
        exit 1
    fi

    NODE_VERSION=$("$NODE_EXE" -v)
    print_ok "Node.js $NODE_VERSION 安装完成"
    NODE_CMD="$NODE_EXE"
    NPM_CMD="$NODE_EXE \"$NPM_CLI\""
fi
echo ""

# ==================== 2. 检查依赖 ====================
if [[ -d "$PROJECT_ROOT/node_modules" ]]; then
    print_ok "项目依赖已安装。"
else
    print_info "首次运行，正在安装项目依赖，请稍候..."
    if [[ -f "$PROJECT_ROOT/package-lock.json" ]]; then
        eval "$NPM_CMD ci"
    else
        eval "$NPM_CMD install"
    fi
    print_ok "依赖安装完成。"
fi
echo ""

# ==================== 3. 检查构建产物 ====================
if [[ -f "$PROJECT_ROOT/dist/server/index.js" ]]; then
    print_ok "构建产物已存在。"
else
    print_info "首次运行，正在编译 TypeScript..."
    eval "$NPM_CMD run build"
    print_ok "编译完成。"
fi
echo ""

# ==================== 4. 检查 .env ====================
if [[ ! -f "$PROJECT_ROOT/.env" && -f "$PROJECT_ROOT/.env.example" ]]; then
    print_info "首次运行，正在生成默认配置文件 .env..."
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    print_ok "已生成 .env，你可以根据需要编辑它。"
fi
echo ""

# ==================== 5. 启动服务 ====================
print_step "        正在启动聊天室服务..."
echo ""

# 启动服务端
print_info "正在启动服务端..."
if [[ "$IS_WIN" == true ]]; then
    # Git Bash: 使用 start 命令在新窗口启动
    start "聊天室服务端" cmd //c "cd /d \"$PROJECT_ROOT\" && $NPM_CMD run start:server"
    sleep 3
    print_ok "服务端已在新窗口启动。"
else
    # Linux/macOS: 后台启动
    eval "$NPM_CMD run start:server &"
    SERVER_PID=$!
    sleep 2
    if kill -0 $SERVER_PID 2>/dev/null; then
        print_ok "服务端已在后台启动 (PID: $SERVER_PID)"
        echo "日志文件: $PROJECT_ROOT/server.log"
        echo "停止命令: kill $SERVER_PID"
    else
        print_err "服务端启动失败"
        exit 1
    fi
fi
echo ""

# 询问是否启动客户端
echo "是否同时启动客户端？"
echo "  [1] 启动客户端（推荐，同一台电脑测试用）"
echo "  [2] 仅启动服务端"
read -rp "请输入选项 (1/2，默认 1): " CHOICE
CHOICE=${CHOICE:-1}

if [[ "$CHOICE" == "1" ]]; then
    echo ""
    print_info "正在启动客户端..."
    if [[ "$IS_WIN" == true ]]; then
        start "聊天室客户端" cmd //c "cd /d \"$PROJECT_ROOT\" && $NPM_CMD run start:client"
    else
        eval "$NPM_CMD run start:client"
    fi
else
    echo ""
    print_info "仅启动服务端。"
    if [[ "$IS_WIN" != true ]]; then
        echo "启动客户端请运行: $NPM_CMD run start:client"
    fi
fi

echo ""
print_step "        启动完成！"
echo ""
