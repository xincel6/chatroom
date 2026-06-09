#Requires -Version 5.1
<#
.SYNOPSIS
    聊天室一键启动器 (PowerShell 版)
    功能：自动检测/安装 Node.js、自动安装依赖、自动编译、自动启动
    首次运行全自动初始化，后续运行直接启动
#>

Set-StrictMode -Off
$ErrorActionPreference = "Continue"

# 切换到脚本所在目录
$PROJECT_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $PROJECT_ROOT

$RUNTIME_DIR = Join-Path $PROJECT_ROOT ".runtime"
$NODE_DIR = Join-Path $RUNTIME_DIR "node"
$NODE_EXE = Join-Path $NODE_DIR "node.exe"
$NPM_CLI = Join-Path $NODE_DIR "node_modules\npm\bin\npm-cli.js"

# 将内置 Node.js 加入 PATH
if (Test-Path $NODE_DIR) {
    $env:PATH = "$NODE_DIR;$($env:PATH)"
}

function Print-Ok($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Print-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Print-Error($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

Write-Host "==========================================" -ForegroundColor Blue
Write-Host "        聊天室一键启动器" -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""

# ==================== 1. 检查 Node.js ====================
$NODE_CMD = $null
$NPM_CMD = $null

try {
    $ver = & node -v 2>$null
    if ($LASTEXITCODE -eq 0) {
        Print-Ok "检测到系统 Node.js $ver"
        $NODE_CMD = "node"
        $NPM_CMD = "npm"
    }
} catch {}

if (-not $NODE_CMD -and (Test-Path $NODE_EXE)) {
    try {
        $ver = & $NODE_EXE -v 2>$null
        Print-Ok "检测到便携 Node.js $ver"
        $NODE_CMD = $NODE_EXE
        $NPM_CMD = "$NODE_EXE `"$NPM_CLI`""
    } catch {}
}

if (-not $NODE_CMD) {
    Print-Info "未检测到 Node.js，正在自动下载安装（无需管理员权限）..."

    if (-not (Test-Path $RUNTIME_DIR)) { New-Item -ItemType Directory -Path $RUNTIME_DIR -Force | Out-Null }
    if (-not (Test-Path $NODE_DIR)) { New-Item -ItemType Directory -Path $NODE_DIR -Force | Out-Null }

    $NODE_VERSION = "v20.17.0"
    $NODE_ZIP = "node-v20.17.0-win-x64.zip"
    $DOWNLOAD_URL = "https://nodejs.org/dist/v20.17.0/$NODE_ZIP"
    $ZIP_PATH = Join-Path $RUNTIME_DIR $NODE_ZIP

    Print-Info "正在下载 Node.js $NODE_VERSION..."
    try {
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($DOWNLOAD_URL, $ZIP_PATH)
    } catch {
        Print-Error "Node.js 下载失败：$($_.Exception.Message)"
        Write-Host "       请检查网络连接或手动安装 Node.js。"
        Read-Host "按回车键退出"
        exit 1
    }

    Print-Info "正在解压 Node.js..."
    try {
        Add-Type -Assembly System.IO.Compression.FileSystem
        [IO.Compression.ZipFile]::ExtractToDirectory($ZIP_PATH, $RUNTIME_DIR)
        $extracted = Join-Path $RUNTIME_DIR "node-v20.17.0-win-x64"
        Get-ChildItem -Path $extracted | Move-Item -Destination $NODE_DIR -Force
        Remove-Item $extracted -Recurse -Force
        Remove-Item $ZIP_PATH -Force
    } catch {
        Print-Error "解压失败：$($_.Exception.Message)"
        Read-Host "按回车键退出"
        exit 1
    }

    if (-not (Test-Path $NODE_EXE)) {
        Print-Error "Node.js 安装后未找到 node.exe。"
        Read-Host "按回车键退出"
        exit 1
    }

    $ver = & $NODE_EXE -v
    Print-Ok "Node.js $ver 安装完成。"
    $NODE_CMD = $NODE_EXE
    $NPM_CMD = "$NODE_EXE `"$NPM_CLI`""
}

Write-Host ""

# ==================== 2. 检查依赖 ====================
if (Test-Path (Join-Path $PROJECT_ROOT "node_modules")) {
    Print-Ok "项目依赖已安装。"
} else {
    Print-Info "首次运行，正在安装项目依赖，请稍候..."
    $installArgs = if (Test-Path (Join-Path $PROJECT_ROOT "package-lock.json")) { "ci" } else { "install" }
    Invoke-Expression "$NPM_CMD $installArgs" | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Print-Error "依赖安装失败。"
        Read-Host "按回车键退出"
        exit 1
    }
    Print-Ok "依赖安装完成。"
}
Write-Host ""

# ==================== 3. 检查构建产物 ====================
if (Test-Path (Join-Path $PROJECT_ROOT "dist\server\index.js")) {
    Print-Ok "构建产物已存在。"
} else {
    Print-Info "首次运行，正在编译 TypeScript..."
    Invoke-Expression "$NPM_CMD run build" | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Print-Error "编译失败。"
        Read-Host "按回车键退出"
        exit 1
    }
    Print-Ok "编译完成。"
}
Write-Host ""

# ==================== 4. 检查 .env ====================
if (-not (Test-Path (Join-Path $PROJECT_ROOT ".env"))) {
    if (Test-Path (Join-Path $PROJECT_ROOT ".env.example")) {
        Print-Info "正在生成默认配置文件 .env..."
        Copy-Item (Join-Path $PROJECT_ROOT ".env.example") (Join-Path $PROJECT_ROOT ".env") -Force
        Print-Ok "已生成 .env，你可以根据需要编辑它。"
    }
}
Write-Host ""

# ==================== 5. 启动服务 ====================
Write-Host "==========================================" -ForegroundColor Blue
Write-Host "        正在启动聊天室服务..." -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""

# 启动服务端
Print-Info "正在启动服务端..."
$serverArgs = "/k cd /d `"$PROJECT_ROOT`" && $NPM_CMD run start:server"
Start-Process cmd -ArgumentList $serverArgs -Title "聊天室服务端"

Start-Sleep -Seconds 3
Print-Ok "服务端已在新窗口启动。"
Write-Host ""

# 询问是否启动客户端
$choice = Read-Host "是否同时启动客户端？ [1]是（默认） [2]否 "
if ($choice -ne "2") {
    Write-Host ""
    Print-Info "正在启动客户端..."
    $clientArgs = "/k cd /d `"$PROJECT_ROOT`" && $NPM_CMD run start:client"
    Start-Process cmd -ArgumentList $clientArgs -Title "聊天室客户端"
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "        启动完成！" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
