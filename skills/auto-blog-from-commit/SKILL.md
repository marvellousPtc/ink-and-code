---
name: generating-blog-from-commits
description: Automatically generate high-quality technical blog posts from Git commits with full project context understanding.
---

# AI 技术博客写作指南

本文档指导 AI 如何基于代码改动生成高质量的技术博客文章。

## 写作原则

### 1. 理解改动意图（最重要）

不要只描述"做了什么"，要深入分析：
- **为什么**要做这个改动？解决了什么问题？
- 有没有其他方案？为什么选择当前方案？
- 这个改动的技术价值是什么？

### 2. 提供深度技术分析

- 解释核心代码的**设计思路**，不是简单复述代码
- 说明关键**技术选型**的原因
- 分享开发中遇到的**坑和解决方案**
- 对比不同实现方式的**优劣**

### 3. 代码示例精炼有力

```typescript
// ❌ 不要这样：贴大段代码没有解释
export async function createArticle(data) {
  const validationError = validateRequired(data, ['title', 'content']);
  if (validationError) return validationError;
  // ... 50 行代码
}

// ✅ 应该这样：关键代码 + 解释
// 核心是先验证再处理，确保数据完整性
const validationError = validateRequired(data, ['title', 'content']);
if (validationError) return validationError;

// 使用 Prisma 创建记录，自动处理关联关系
const article = await prisma.post.create({
  data: { ...data, userId },
  include: { category: true }
});
```

### 4. 文章结构清晰

```markdown
## 背景
- 遇到了什么问题/需求
- 为什么现有方案不够好

## 技术方案
- 核心设计思路
- 关键技术选型及原因
- 架构图或流程图（如适用）

## 实现细节
- 核心代码解析
- 重要的细节处理
- 踩过的坑

## 效果与总结
- 改动带来的效果
- 学到了什么
- 后续优化方向
```

### 5. 写作风格

- 语言简洁，避免啰嗦和重复
- 专业术语保留英文（如 API、Hook、State）
- 用类比帮助理解复杂概念
- 分享真实开发体验，不要假大空

## 示例

### 输入

```
Commit: [blog] 实现 Markdown 到 TipTap JSON 的转换

Changed files:
- lib/markdown-to-tiptap.ts (new)
- app/api/article/create-from-commit/route.ts (modified)

Diff: 添加了 markdownToTiptap 函数，在 API 中调用转换
```

### 输出

```markdown
## 背景

在开发自动博客生成功能时，遇到一个问题：AI 生成的是 Markdown 格式，
但 TipTap 编辑器需要 JSON 格式。直接存储 Markdown 会导致编辑器无法正确加载内容。

## 技术方案

考虑了两种方案：
1. 前端渲染时转换 —— 简单但每次都要转换，且编辑器无法编辑
2. **后端存储时转换** —— 一次转换，编辑器可正常工作 ✅

选择方案 2，在 API 层实现 Markdown → TipTap JSON 转换。

## 实现细节

核心是解析 Markdown 语法，生成对应的 TipTap 节点：

- 标题 `#` → `{ type: 'heading', attrs: { level: n } }`
- 段落 → `{ type: 'paragraph' }`
- 代码块 → `{ type: 'codeBlock', attrs: { language } }`

处理行内样式时，需要递归解析 **粗体**、*斜体*、`代码` 等标记。

## 总结

这个功能让 AI 生成的文章可以在编辑器中正常显示和编辑。
后续可以考虑支持更多 Markdown 语法，如表格、任务列表等。
```

## 配置说明

### GitHub Secrets

| Secret | 说明 |
|--------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API（推荐，性价比高） |
| `INK_AND_CODE_TOKEN` | 博客 API Token |
| `INK_AND_CODE_URL` | 博客 URL |

### 使用方法

```bash
git commit -m "[blog] 你的改动描述"
git push
```

工作流会自动读取项目上下文（结构、配置、改动文件内容），生成高质量博客。
