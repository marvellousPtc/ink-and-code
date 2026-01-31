---
title: "Next.js 项目部署完全指南：从 GitHub Actions 到域名配置"
date: "2026-01-31"
excerpt: "手把手教你配置 GitHub Actions 自动部署、SSH 密钥、域名 DNS 解析、Nginx 反向代理和 HTTPS 证书"
tags: ["DevOps", "GitHub Actions", "Nginx", "部署"]
---

# Next.js 项目部署完全指南

本文将详细介绍如何将 Next.js 项目通过 GitHub Actions 自动部署到自有服务器，并配置域名和 HTTPS。

## 目录

1. [准备工作](#准备工作)
2. [配置 SSH 密钥](#配置-ssh-密钥)
3. [配置 GitHub Secrets](#配置-github-secrets)
4. [编写 GitHub Actions Workflow](#编写-github-actions-workflow)
5. [配置域名 DNS 解析](#配置域名-dns-解析)
6. [配置 Nginx 反向代理](#配置-nginx-反向代理)
7. [配置 HTTPS 证书](#配置-https-证书)

---

## 准备工作

在开始之前，确保你具备以下条件：

- 一台云服务器（本文以 Ubuntu 为例）
- 一个已购买的域名
- GitHub 仓库中的 Next.js 项目
- 服务器已安装 Node.js、pnpm、PM2

---

## 配置 SSH 密钥

GitHub Actions 需要通过 SSH 连接到你的服务器执行部署命令。我们需要生成一对 SSH 密钥。

### 步骤 1：在本地生成 SSH 密钥

打开终端，执行以下命令：

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy"
```

按提示操作：
- 文件保存位置：建议保存为 `~/.ssh/github_actions_deploy`
- 密码：直接回车留空（自动化部署不能有密码）

执行完成后会生成两个文件：
- `github_actions_deploy` - 私钥（给 GitHub 用）
- `github_actions_deploy.pub` - 公钥（给服务器用）

### 步骤 2：将公钥添加到服务器

SSH 连接到你的服务器：

```bash
ssh root@你的服务器IP
```

编辑 authorized_keys 文件：

```bash
nano ~/.ssh/authorized_keys
```

将 `github_actions_deploy.pub` 文件的内容粘贴到文件末尾，保存退出。

或者使用一行命令：

```bash
# 在本地执行
cat ~/.ssh/github_actions_deploy.pub | ssh root@你的服务器IP "cat >> ~/.ssh/authorized_keys"
```

### 步骤 3：测试 SSH 连接

```bash
ssh -i ~/.ssh/github_actions_deploy root@你的服务器IP
```

如果能成功连接，说明密钥配置正确。

---

## 配置 GitHub Secrets

GitHub Secrets 用于安全地存储敏感信息，如服务器 IP、SSH 密钥等。

### 步骤 1：进入仓库设置页面

1. 打开你的 GitHub 仓库页面
2. 点击顶部导航栏的 **Settings**（设置）
3. 在左侧菜单找到 **Secrets and variables**
4. 点击展开后选择 **Actions**

### 步骤 2：添加 Repository Secrets

点击 **New repository secret** 按钮，依次添加以下 secrets：

| Name | Value | 说明 |
|------|-------|------|
| `SERVER_HOST` | `119.91.214.9` | 服务器 IP 地址 |
| `SERVER_USER` | `root` | SSH 登录用户名 |
| `SERVER_PORT` | `22` | SSH 端口号 |
| `SERVER_SSH_KEY` | （私钥内容） | github_actions_deploy 文件的完整内容 |
| `PROJECT_PATH` | `/ptc/ink-and-code` | 服务器上的项目路径 |

**注意**：`SERVER_SSH_KEY` 需要复制私钥文件的**完整内容**，包括 `-----BEGIN OPENSSH PRIVATE KEY-----` 和 `-----END OPENSSH PRIVATE KEY-----`。

### 步骤 3：添加 Environment Secrets（可选）

如果你的项目需要环境变量（如数据库连接字符串），可以创建 Environment：

1. 在 Settings 左侧菜单点击 **Environments**
2. 点击 **New environment**，输入名称如 `Production`
3. 在 Environment 页面点击 **Add secret**
4. 添加如 `DATABASE_URL` 等敏感环境变量

---

## 编写 GitHub Actions Workflow

### CI 工作流（代码检查和构建测试）

在项目根目录创建 `.github/workflows/ci.yml`：

```yaml
# 持续集成 - 代码检查和构建测试
name: CI

on:
  push:
    branches: [main, develop]  # 推送到这些分支时触发
  pull_request:
    branches: [main]           # PR 到 main 时触发

jobs:
  lint-and-build:
    runs-on: ubuntu-latest     # 使用 Ubuntu 最新版运行
    environment: Production    # 使用 Production 环境的 secrets

    steps:
      # 步骤1：检出代码到 runner
      - name: 检出代码
        uses: actions/checkout@v4

      # 步骤2：安装 pnpm 包管理器
      - name: 安装 pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      # 步骤3：设置 Node.js 环境
      - name: 设置 Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'        # 缓存 pnpm 依赖，加速后续构建

      # 步骤4：安装项目依赖
      - name: 安装依赖
        run: pnpm install

      # 步骤5：构建项目
      - name: 构建测试
        run: pnpm build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}  # 注入环境变量
```

**各步骤作用解释**：

| 步骤 | 作用 |
|------|------|
| `actions/checkout@v4` | 将仓库代码克隆到 GitHub Actions 运行器 |
| `pnpm/action-setup@v2` | 安装 pnpm 包管理器 |
| `actions/setup-node@v4` | 安装 Node.js 并配置缓存 |
| `pnpm install` | 安装项目依赖 |
| `pnpm build` | 构建项目，验证代码是否能正常编译 |

### CD 工作流（自动部署到服务器）

创建 `.github/workflows/deploy-server.yml`：

```yaml
# 部署到自有服务器（通过 SSH）
name: Deploy to Server

on:
  push:
    branches: [main]    # 只有推送到 main 分支才部署
  workflow_dispatch:    # 允许在 GitHub 页面手动触发

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      # 步骤1：检出代码
      - name: 检出代码
        uses: actions/checkout@v4

      # 步骤2：通过 SSH 连接服务器并执行部署命令
      - name: 通过 SSH 部署到服务器
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SERVER_HOST }}         # 服务器 IP
          username: ${{ secrets.SERVER_USER }}     # 登录用户名
          key: ${{ secrets.SERVER_SSH_KEY }}       # SSH 私钥
          port: ${{ secrets.SERVER_PORT }}         # SSH 端口
          timeout: 60s                             # 连接超时时间
          script: |
            # 进入项目目录
            cd ${{ secrets.PROJECT_PATH }}
            
            # 拉取最新代码
            git pull origin main
            
            # 安装依赖
            pnpm install
            
            # 生成 Prisma Client（如果使用 Prisma）
            pnpm prisma generate
            
            # 构建项目
            pnpm build
            
            # 重启服务 - 先删除旧进程再启动新进程
            pm2 delete ink-and-code || true
            pm2 start "npx next start" --name "ink-and-code"
            pm2 save
            
            echo "✅ 部署完成！"
```

**部署流程说明**：

1. 代码推送到 main 分支
2. GitHub Actions 启动
3. 通过 SSH 连接到你的服务器
4. 在服务器上执行：拉代码 → 装依赖 → 构建 → 重启服务

### 手动触发部署

如果需要手动触发部署：

1. 进入 GitHub 仓库页面
2. 点击顶部 **Actions** 标签
3. 左侧选择 **Deploy to Server**
4. 点击右侧 **Run workflow** 按钮
5. 选择分支后点击绿色 **Run workflow**

---

## 配置域名 DNS 解析

购买域名后，需要将域名指向你的服务器 IP。

### 步骤 1：进入域名管理控制台

以腾讯云为例：

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/)
2. 搜索「域名注册」或「DNS 解析」
3. 找到你的域名，点击「解析」

### 步骤 2：添加 A 记录

点击「添加记录」或「快速添加网站解析」，配置如下：

**记录 1：根域名**

| 字段 | 值 |
|------|-----|
| 主机记录 | `@` |
| 记录类型 | `A` |
| 记录值 | `你的服务器IP` |
| TTL | 600（默认即可） |

**记录 2：www 子域名**

| 字段 | 值 |
|------|-----|
| 主机记录 | `www` |
| 记录类型 | `A` |
| 记录值 | `你的服务器IP` |
| TTL | 600 |

### 步骤 3：等待 DNS 生效

DNS 解析通常需要几分钟到几小时生效。可以用以下命令检查：

```bash
# 检查 DNS 是否生效
ping yourdomain.com

# 或使用 dig 命令
dig yourdomain.com
```

---

## 配置 Nginx 反向代理

Nginx 作为反向代理，将 80 端口的请求转发到 Next.js 的 3000 端口。

### 为什么需要 Nginx？

- **端口映射**：浏览器默认访问 80 端口，Next.js 默认运行在 3000 端口
- **HTTPS 支持**：Nginx 可以轻松配置 SSL 证书
- **性能优化**：Nginx 处理静态资源更高效
- **多站点支持**：一台服务器可以托管多个网站

### 步骤 1：安装 Nginx

SSH 连接到服务器后执行：

```bash
apt update
apt install nginx -y
```

### 步骤 2：创建站点配置文件

```bash
nano /etc/nginx/sites-available/yourdomain.com
```

输入以下内容（将 `yourdomain.com` 替换为你的域名）：

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        # 将请求转发到 Next.js 应用
        proxy_pass http://127.0.0.1:3000;
        
        # HTTP 版本
        proxy_http_version 1.1;
        
        # 传递原始请求信息
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
```

**配置项说明**：

| 配置 | 作用 |
|------|------|
| `listen 80` | 监听 80 端口（HTTP 默认端口） |
| `server_name` | 指定域名，匹配后才会处理请求 |
| `proxy_pass` | 将请求转发到本地 3000 端口 |
| `proxy_set_header Host` | 保留原始 Host 头 |
| `proxy_set_header X-Real-IP` | 传递客户端真实 IP |
| `Upgrade / Connection` | 支持 WebSocket 连接 |

### 步骤 3：启用站点配置

```bash
# 创建软链接到 sites-enabled 目录
ln -sf /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/

# 删除默认站点配置（可选）
rm -f /etc/nginx/sites-enabled/default

# 测试配置是否正确
nginx -t
```

如果显示 `syntax is ok` 和 `test is successful`，说明配置正确。

### 步骤 4：重启 Nginx

```bash
# 设置开机自启
systemctl enable nginx

# 重启 Nginx
systemctl restart nginx

# 查看状态
systemctl status nginx
```

现在访问 `http://yourdomain.com` 应该能看到你的网站了。

---

## 配置 HTTPS 证书

使用 Let's Encrypt 免费证书，通过 Certbot 自动配置。

### 步骤 1：安装 Certbot

```bash
apt install certbot python3-certbot-nginx -y
```

### 步骤 2：申请并配置证书

```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

按提示操作：

1. 输入邮箱地址（用于接收证书到期提醒）
2. 同意服务条款（输入 `Y`）
3. 是否分享邮箱（可选择 `N`）
4. 选择是否将 HTTP 重定向到 HTTPS（建议选择 `2` 强制 HTTPS）

### 步骤 3：验证 HTTPS

访问 `https://yourdomain.com`，浏览器地址栏应该显示小锁图标。

### 步骤 4：自动续期

Let's Encrypt 证书有效期 90 天，Certbot 会自动配置定时任务续期。

验证自动续期是否配置：

```bash
# 测试续期（不会真的续期）
certbot renew --dry-run
```

如果显示 `Congratulations, all simulated renewals succeeded`，说明自动续期配置正确。

---

## 完整部署流程回顾

1. **生成 SSH 密钥** → 让 GitHub Actions 能连接服务器
2. **配置 GitHub Secrets** → 安全存储敏感信息
3. **编写 Workflow 文件** → 定义 CI/CD 流程
4. **配置 DNS 解析** → 域名指向服务器 IP
5. **配置 Nginx** → 80 端口转发到 3000 端口
6. **配置 HTTPS** → 启用安全连接

完成以上步骤后，每次推送代码到 main 分支，GitHub Actions 会自动：

1. 检查代码 → 2. 构建测试 → 3. SSH 到服务器 → 4. 拉取代码 → 5. 重新构建 → 6. 重启服务

实现真正的自动化部署！

---

## 常见问题

### Q: GitHub Actions 部署失败，提示 SSH 连接超时？

检查：
- 服务器防火墙是否开放 22 端口
- SSH 密钥是否正确配置
- `SERVER_HOST` 是否填写正确

### Q: 网站显示 502 Bad Gateway？

说明 Nginx 无法连接到 Next.js 应用，检查：
- PM2 服务是否在运行：`pm2 list`
- Next.js 是否在 3000 端口：`curl http://127.0.0.1:3000`

### Q: HTTPS 证书申请失败？

确保：
- 域名 DNS 已经生效（能 ping 通）
- 80 端口已开放且 Nginx 在运行
- 域名没有被 Cloudflare 等 CDN 代理

---

希望这篇文章对你有帮助！如有问题欢迎留言讨论。
