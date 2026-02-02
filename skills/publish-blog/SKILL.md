# Publish Blog Post to Ink & Code

## Description

将代码改动或技术内容发布为博客文章到 Ink & Code 网站。利用 Cursor 的完整项目上下文，生成高质量的技术博客。

## Trigger

此 Skill 通过两种方式触发：

1. **自动触发**：提交包含 `[blog]` 的 commit 后，Git Hook 会自动复制提示词到剪贴板并激活 Cursor
2. **手动触发**：用户直接请求生成博客

## Usage

用户可能会这样请求：
- "帮我把刚才的改动写成一篇技术博客"
- "把这个功能的实现写成博客发布"
- "根据最近的 commit 写一篇技术文章"
- "帮我写一篇关于 XXX 的博客并发布"

## Prerequisites

需要配置环境变量（添加到 ~/.zshrc 或 ~/.bashrc）：
```bash
export INK_AND_CODE_TOKEN="ink_your_api_token_here"
export INK_AND_CODE_URL="http://8.134.248.1:3000"
```

获取 Token：访问网站 -> 设置 -> API Token -> 创建新 Token

## Workflow

### 1. 理解改动

如果用户要求根据代码改动生成文章：

```bash
# 查看最近的改动
git diff HEAD~1 HEAD

# 查看改动的文件
git diff --name-only HEAD~1 HEAD

# 查看 commit 信息
git log -1 --format="%H%n%s%n%b"
```

### 2. 深入理解上下文

- 阅读改动涉及的文件，理解代码结构
- 查看相关的配置文件、类型定义
- 理解这个改动解决了什么问题
- 分析技术实现的关键点

### 3. 生成文章

撰写一篇高质量的技术博客，包含：

- **引人注目的标题**：简洁明了，体现技术亮点
- **背景介绍**：为什么要做这个改动，解决什么问题
- **技术实现**：
  - 核心代码解析
  - 关键设计决策
  - 遇到的挑战和解决方案
- **代码示例**：展示关键代码片段，附带解释
- **总结**：收获、最佳实践、未来改进方向

### 4. 发布文章

调用 API 发布文章：

```bash
curl -X POST "${INK_AND_CODE_URL}/api/article/create-from-commit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${INK_AND_CODE_TOKEN}" \
  -d '{
    "title": "文章标题",
    "content": "Markdown 格式的文章内容",
    "tags": ["标签1", "标签2"],
    "published": false,
    "commitInfo": {
      "repo": "仓库名",
      "sha": "commit hash",
      "message": "commit message",
      "url": "commit url"
    }
  }'
```

**API 响应示例：**
```json
{
  "code": 201,
  "message": "文章创建成功",
  "data": {
    "id": "article-id",
    "title": "文章标题",
    "slug": "article-slug",
    "published": false,
    "url": "/u/username/article-slug"
  }
}
```

## Content Guidelines

### 文章风格
- 使用中文撰写
- 技术准确，但易于理解
- 包含实际的代码示例
- 解释"为什么"比"是什么"更重要

### Markdown 格式要求
- 使用 `##` 开头的二级标题作为主要章节
- 代码块使用正确的语言标识（如 ```typescript）
- 适当使用列表、引用、粗体等格式增强可读性

### 文章长度
- 800-2000 字为宜
- 代码示例不要过长，突出关键部分
- 复杂主题可以分多篇文章

## Example

用户请求："帮我把刚才实现的用户认证功能写成博客"

AI 执行步骤：
1. 运行 `git diff` 查看改动
2. 阅读 `auth.ts`、`login/page.tsx` 等相关文件
3. 理解认证流程的设计
4. 撰写文章，包含：
   - 为什么选择这种认证方案
   - 核心代码实现解析
   - 安全性考虑
   - 使用示例
5. 调用 API 发布
6. 返回文章链接给用户

## Notes

- 文章默认为草稿状态（`published: false`），用户可以在网站上预览后再发布
- API 会自动将 Markdown 转换为编辑器兼容的格式
- 如果没有配置环境变量，提示用户先进行配置
