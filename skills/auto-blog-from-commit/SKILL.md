---
name: generating-blog-from-commits
description: Use this skill when the user wants to automatically generate technical blog posts from Git commits. This skill helps set up GitHub Actions workflows that detect commits with [blog] tags, use AI to generate articles from commit diffs, and publish them to ink-and-code blog platform. Trigger keywords include commit blog, auto blog, git commit article, generate post from code changes, and automated technical writing.
---

# Generating Blog Posts from Git Commits

This skill helps you set up an automated workflow that generates technical blog posts from Git commits and publishes them to an ink-and-code blog platform.

> 📖 **完整使用指南请查看 [README.md](./README.md)**

## Overview

The workflow:
1. Detects commits with `[blog]` tag in the commit message
2. Extracts the commit diff and changed files
3. Uses AI (Claude or GPT-4) to generate a technical blog post
4. Publishes the article to the user's blog via API

## Quick Setup (5 分钟快速配置)

### Step 1: Create API Token (博客网站)

1. 登录博客 → **设置** → **API Token**
2. 点击 **创建**，输入名称如 `GitHub Actions`
3. ⚠️ **立即复制 Token**（只显示一次）

### Step 2: Add GitHub Secrets

In your target repository, go to **Settings → Secrets and variables → Actions** and add:

| Secret Name | Description |
|-------------|-------------|
| `INK_AND_CODE_TOKEN` | Your blog API token (starts with `ink_`) |
| `INK_AND_CODE_URL` | Your blog URL (e.g., `https://your-blog.com`) |
| `ANTHROPIC_API_KEY` | Claude API key (recommended) |
| `OPENAI_API_KEY` | OpenAI API key (alternative) |

### Step 3: Add Workflow File

Create `.github/workflows/auto-blog.yml` in your repository with the content from `./github-action.yml`.

### Step 4: Use It!

When making a commit that you want to turn into a blog post, include `[blog]` in your commit message:

```bash
git commit -m "[blog] Add user authentication with JWT tokens"
```

The workflow will automatically:
- Detect the `[blog]` tag
- Get the commit diff
- Generate a blog post with AI
- Publish it as a draft to your blog

## API Endpoint Reference

### POST /api/article/create-from-commit

Creates a new article using API Token authentication.

**Headers:**
```
Authorization: Bearer ink_xxxxxxxx
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Article Title",
  "content": "Markdown content...",
  "slug": "optional-custom-slug",
  "excerpt": "Optional excerpt",
  "tags": ["tag1", "tag2"],
  "categorySlug": "optional-category",
  "published": false,
  "commitInfo": {
    "repo": "owner/repo",
    "sha": "abc1234",
    "message": "Commit message",
    "url": "https://github.com/..."
  }
}
```

**Response:**
```json
{
  "code": 201,
  "message": "文章创建成功",
  "data": {
    "id": "uuid",
    "title": "Article Title",
    "slug": "article-slug",
    "published": false,
    "url": "https://blog.com/u/username/article-slug",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## Customization Tips

### Modify AI Prompt

Edit the `PROMPT` variable in the workflow to customize the generated content style:

- Change language (default is Chinese)
- Adjust word count
- Add specific formatting requirements
- Include custom sections

### Filter by File Types

Add conditions to only trigger for specific file changes:

```yaml
if: |
  contains(github.event.head_commit.message, '[blog]') &&
  (
    contains(steps.diff.outputs.files_changed, '.ts') ||
    contains(steps.diff.outputs.files_changed, '.tsx')
  )
```

### Auto-Publish

To publish articles immediately instead of as drafts, change:

```json
"published": true
```

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Check that your `INK_AND_CODE_TOKEN` is correct
2. **AI Generation Failed**: Verify your AI API key is valid
3. **Workflow Not Triggered**: Ensure commit message contains `[blog]`
4. **Empty Response**: The commit diff might be too large; try smaller changes

### Debugging

Add this step to see raw values:

```yaml
- name: Debug
  run: |
    echo "Commit Message: ${{ github.event.head_commit.message }}"
    echo "Files Changed: ${{ steps.diff.outputs.files_changed }}"
```

## Example Commit Messages

Good examples that trigger the workflow:

```
[blog] Implement Redis caching for API responses
[blog] Fix memory leak in WebSocket connections
[blog] Refactor authentication flow with OAuth2
```

The `[blog]` tag can be anywhere in the message:

```
Add dark mode support [blog]
Performance improvements [blog] - reduce bundle size by 40%
```
