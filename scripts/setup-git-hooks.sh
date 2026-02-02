#!/bin/bash

# 设置 Git Hooks 脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$PROJECT_DIR/.git-hooks"
GIT_HOOKS_DIR="$PROJECT_DIR/.git/hooks"

echo "🔧 设置 Git Hooks..."
echo ""

# 检查 .git-hooks 目录是否存在
if [[ ! -d "$HOOKS_DIR" ]]; then
    echo "❌ 错误: .git-hooks 目录不存在"
    exit 1
fi

# 配置 git 使用自定义 hooks 目录
git config core.hooksPath .git-hooks

# 确保 hooks 可执行
chmod +x "$HOOKS_DIR"/*

echo "✅ Git Hooks 已配置完成！"
echo ""
echo "当你提交包含 [blog] 的 commit 时："
echo "  1. 提示词会自动复制到剪贴板"
echo "  2. Cursor 会被激活"
echo "  3. 你只需粘贴 (Cmd+V) 并执行即可"
echo ""
echo "📝 记得配置环境变量："
echo "  export INK_AND_CODE_TOKEN=\"your-api-token\""
echo "  export INK_AND_CODE_URL=\"http://your-site-url\""
echo ""
