# 🚀 Auto Blog from Commit

自动将 Git Commit 转换为技术博客文章，并发布到 ink-and-code 博客平台。

## 工作原理

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  你的任意仓库    │────▶│  GitHub Actions  │────▶│  你的博客网站    │
│  commit [blog]  │     │  + AI 生成文章    │     │  ink-and-code   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

1. 你在任意仓库提交代码时，commit message 包含 `[blog]` 标记
2. GitHub Actions 自动触发，获取 commit diff
3. AI（Claude 或 GPT-4）根据代码变更生成技术文章
4. 通过 API 自动发布到你的博客（默认为草稿）

---

## 📋 完整配置步骤

### 第一步：在博客网站创建 API Token

1. 打开你的博客网站，登录后进入 **设置页面**
2. 找到 **API Token** 区域，点击展开
3. 输入名称（如 `GitHub Actions`），点击 **创建**
4. ⚠️ **立即复制 Token**，它只显示一次！Token 格式：`ink_xxxxxxxxxxxxxxxx`

![创建 Token](https://your-blog.com/docs/create-token.png)

---

### 第二步：获取 AI API Key

三选一，推荐使用 **DeepSeek**（便宜好用）：

#### 方式 A：使用 DeepSeek API（推荐 🔥）

1. 访问 [DeepSeek 开放平台](https://platform.deepseek.com/)
2. 注册/登录后，进入 **API Keys** 页面
3. 点击 **创建 API Key**，复制生成的 Key
4. 格式类似：`sk-xxxxxxxxxxxx`
5. **优势**：价格便宜（约 ¥0.001/千 tokens），效果好

#### 方式 B：使用 Claude API

1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 注册/登录后，进入 **API Keys** 页面
3. 点击 **Create Key**，复制生成的 API Key
4. 格式类似：`sk-ant-api03-xxxxxxxxxxxx`

#### 方式 C：使用 OpenAI API

1. 访问 [OpenAI Platform](https://platform.openai.com/api-keys)
2. 登录后点击 **Create new secret key**
3. 复制生成的 API Key
4. 格式类似：`sk-xxxxxxxxxxxx`

---

### 第三步：在目标仓库配置 Secrets

进入你想要自动生成博客的 **GitHub 仓库**：

1. 点击 **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**，添加以下 secrets：

| Secret 名称 | 值 | 说明 |
|------------|---|------|
| `INK_AND_CODE_TOKEN` | `ink_xxxxxxxx` | 第一步创建的博客 API Token |
| `INK_AND_CODE_URL` | `https://your-blog.com` | 你的博客网站地址 |
| `DEEPSEEK_API_KEY` | `sk-xxx` | DeepSeek API Key（推荐，三选一） |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-xxx` | Claude API Key（三选一） |
| `OPENAI_API_KEY` | `sk-xxx` | OpenAI API Key（三选一） |

> 💡 **AI API 只需配置一个**，优先级：DeepSeek > Claude > OpenAI

![配置 Secrets](https://docs.github.com/assets/images/help/repository/actions-secrets.png)

---

### 第四步：添加 GitHub Actions 工作流

在你的仓库中创建文件 `.github/workflows/auto-blog.yml`：

```yaml
# 复制 github-action.yml 的内容到这里
```

或者直接复制本目录下的 `github-action.yml` 文件内容。

**快速操作：**

```bash
# 在你的仓库根目录执行
mkdir -p .github/workflows
curl -o .github/workflows/auto-blog.yml https://raw.githubusercontent.com/你的用户名/ink-and-code/main/skills/auto-blog-from-commit/github-action.yml
```

---

### 第五步：使用！

现在，当你提交代码时，只需在 commit message 中包含 `[blog]` 标记：

```bash
# 示例 1：新功能
git commit -m "[blog] 实现用户认证功能，支持 JWT Token"

# 示例 2：Bug 修复
git commit -m "[blog] 修复首页加载缓慢的性能问题"

# 示例 3：标记可以在任意位置
git commit -m "重构数据库查询逻辑 [blog]"
```

**不包含 `[blog]` 的 commit 不会触发。**

---

## 🔧 配置选项

### 修改默认发布状态

默认文章是 **草稿** 状态，如果想直接发布，修改工作流中的：

```yaml
"published": true
```

### 修改 AI 生成风格

编辑工作流中的 `PROMPT` 变量，可以自定义：

- 文章语言（默认中文）
- 字数要求
- 文章结构
- 写作风格

### 只对特定文件类型触发

添加文件类型过滤：

```yaml
if: |
  contains(github.event.head_commit.message, '[blog]') &&
  (
    contains(steps.diff.outputs.files_changed, '.ts') ||
    contains(steps.diff.outputs.files_changed, '.py')
  )
```

---

## 📊 查看运行结果

1. 进入仓库的 **Actions** 标签页
2. 找到 **Auto Blog from Commit** 工作流
3. 点击查看运行日志

成功后会显示：
```
✅ Blog post created successfully!
📝 Title: 实现用户认证功能详解
🔗 URL: https://your-blog.com/u/username/article-slug
```

---

## ❓ 常见问题

### Q: 工作流没有触发？

检查：
- commit message 是否包含 `[blog]`
- 是否推送到 `main` 或 `master` 分支
- Actions 是否被禁用（Settings → Actions → General）

### Q: AI 生成失败？

检查：
- API Key 是否正确配置
- API Key 是否有余额/额度
- 查看 Actions 日志中的错误信息

### Q: 发布到博客失败（401 错误）？

检查：
- `INK_AND_CODE_TOKEN` 是否正确
- Token 是否过期
- `INK_AND_CODE_URL` 是否正确（注意 https）

### Q: 文章内容不满意？

可以：
- 修改 PROMPT 调整生成风格
- 在博客后台编辑修改
- 删除后重新触发（修改 commit message 后 force push）

---

## 💰 费用说明

| 服务 | 费用 |
|-----|------|
| GitHub Actions | 公开仓库免费，私有仓库有免费额度 |
| **DeepSeek API** | 约 ¥0.001/1K tokens（**超便宜！**） |
| Claude API | 约 $0.003/1K tokens |
| OpenAI API | 约 $0.01/1K tokens |

一篇文章大约消耗 2000-4000 tokens：
- **DeepSeek**: 约 ¥0.002-0.004（几乎免费）
- Claude: 约 $0.01-0.02
- OpenAI: 约 $0.02-0.04

---

## 📁 文件说明

```
skills/auto-blog-from-commit/
├── README.md           # 本说明文档
├── SKILL.md            # AI Agent Skill 定义文件
└── github-action.yml   # GitHub Actions 工作流模板
```

---

## 🎯 示例效果

**Commit Message:**
```
[blog] 添加 Redis 缓存层，API 响应速度提升 10 倍
```

**生成的文章标题:**
> Redis 缓存实战：让 API 响应速度飞起来

**生成的文章结构:**
1. 背景：为什么需要缓存
2. 技术选型：为什么选择 Redis
3. 实现细节：关键代码解析
4. 性能对比：优化前后数据
5. 总结与思考

---

有问题？欢迎提 Issue！
