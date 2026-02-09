#!/bin/bash
###
 # :file description: 
 # :name: /ink-and-code/.cursor/skills/generate-blog/publish.sh
 # :author: PTC
 # :copyright: (c) 2026, Tungee
 # :date created: 2026-02-05 10:58:52
 # :last editor: PTC
 # :date last edited: 2026-02-05 17:09:44
### 
# Publish blog post to Ink & Code
# Usage: ./publish.sh "文章标题" "标签1,标签2" [content_file]
# If content_file not provided, reads from stdin or clipboard

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Load .env
load_env() {
    local env_files=(
        "$SCRIPT_DIR/.env"
        "$PROJECT_ROOT/.env"
        "$PROJECT_ROOT/.env.local"
    )
    
    for env_file in "${env_files[@]}"; do
        if [ -f "$env_file" ]; then
            while IFS='=' read -r key value || [ -n "$key" ]; do
                [[ "$key" =~ ^#.*$ ]] && continue
                [[ -z "$key" ]] && continue
                value="${value%\"}"
                value="${value#\"}"
                if [ -z "${!key}" ]; then
                    export "$key=$value"
                fi
            done < "$env_file"
        fi
    done
}

load_env

if [ -z "$INK_AND_CODE_TOKEN" ] || [ -z "$INK_AND_CODE_URL" ]; then
    echo -e "${RED}Error: Missing config${NC}"
    echo "Edit $SCRIPT_DIR/.env with your credentials"
    exit 1
fi

TITLE="$1"
TAGS="$2"
CONTENT_FILE="$3"

if [ -z "$TITLE" ]; then
    echo "Usage: $0 \"文章标题\" \"标签1,标签2\" [content_file]"
    exit 1
fi

# Get content
if [ -n "$CONTENT_FILE" ] && [ -f "$CONTENT_FILE" ]; then
    CONTENT=$(cat "$CONTENT_FILE")
elif [ ! -t 0 ]; then
    CONTENT=$(cat)
else
    # Try clipboard (macOS)
    CONTENT=$(pbpaste 2>/dev/null || echo "")
    if [ -z "$CONTENT" ]; then
        echo -e "${RED}Error: No content provided${NC}"
        echo "Provide content via: file, stdin, or clipboard"
        exit 1
    fi
    echo -e "${BLUE}Using content from clipboard${NC}"
fi

echo -e "${BLUE}Publishing: $TITLE${NC}"

# Build JSON
jq -n \
    --arg title "$TITLE" \
    --arg content "$CONTENT" \
    --arg tags "$TAGS" \
    '{
        title: $title,
        content: $content,
        tags: (if $tags == "" then [] else ($tags | split(",") | map(gsub("^\\s+|\\s+$"; ""))) end),
        published: false
    }' > /tmp/blog_payload.json

# Call API
RESULT=$(curl -sL -w "\n%{http_code}" -X POST "${INK_AND_CODE_URL}/api/article/create-from-commit" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $INK_AND_CODE_TOKEN" \
    -d @/tmp/blog_payload.json)

HTTP_CODE=$(echo "$RESULT" | tail -n1)
BODY=$(echo "$RESULT" | sed '$d')

CODE=$(echo "$BODY" | jq -r '.code // 500')

if [ "$CODE" != "201" ]; then
    echo -e "${RED}Failed to publish${NC}"
    echo "Error: $(echo "$BODY" | jq -r '.message // "Unknown error"')"
    exit 1
fi

ARTICLE_URL=$(echo "$BODY" | jq -r '.data.url // "N/A"')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Blog post created!${NC}"
echo -e "Title: $TITLE"
echo -e "URL: ${INK_AND_CODE_URL}${ARTICLE_URL}"
echo -e "${GREEN}========================================${NC}"
