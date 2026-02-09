---
name: generate-blog
description: 生成技术博客并发布到 Ink & Code。支持根据 commit、主题或整个仓库生成博客文章。当用户提到"生成博客"、"写博客"、"发布文章"、"根据commit写博客"时触发。
---

# 生成博客文章

通过 Cursor AI 生成高质量技术博客，并发布到 Ink & Code 博客系统。

## 工作流程

当用户请求生成博客时：

### 1. 确定生成模式

询问用户想要哪种模式：
- **commit 模式**：根据某个 commit 的改动生成（需要 commit 哈希或使用最近的）
- **topic 模式**：根据特定主题生成（需要主题描述）
- **repo 模式**：介绍整个项目

### 2. 收集上下文

根据模式收集相关代码：

```bash
# commit 模式
git diff HEAD~1 HEAD
git diff --name-only HEAD~1 HEAD

# 读取改动的文件内容
```

### 3. 生成博客内容

根据代码上下文，撰写一篇高质量中文技术博客，包含：

- **引人注目的标题**
- **背景**：为什么做这个改动，解决什么问题
- **技术方案**：核心设计思路，关键技术选型
- **实现细节**：核心代码解析，踩过的坑
- **总结**：收获、最佳实践

### 4. 发布文章

使用脚本发布到博客系统：

```bash
./.cursor/skills/generate-blog/publish.sh "文章标题" "标签1,标签2"
```

脚本会读取剪贴板中的 Markdown 内容并发布。

或者手动调用 API：

```bash
curl -X POST "${INK_AND_CODE_URL}/api/article/create-from-commit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${INK_AND_CODE_TOKEN}" \
  -d '{
    "title": "文章标题",
    "content": "Markdown 内容",
    "tags": ["标签1", "标签2"],
    "published": false
  }'
```

## 配置

在 `.cursor/skills/generate-blog/.env` 中配置：

```bash
INK_AND_CODE_TOKEN=ink_your_api_token
INK_AND_CODE_URL=http://your-blog-url.com
```

## 写作指南

### 文章结构

```markdown
## 背景
- 遇到的问题或需求
- 为什么现有方案不够好

## 技术方案
- 核心设计思路
- 关键技术选型及原因

## 实现细节
- 核心代码解析
- 重要的细节处理
- 踩过的坑

## 总结
- 改动带来的效果
- 学到了什么
```

### 写作风格

- 中文撰写，专业术语保留英文（如 API、Hook、State）
- 解释"为什么"比"是什么"更重要
- 代码示例精炼，附带解释
- 800-2000 字为宜
