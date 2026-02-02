'use client';

import { Key, Plus, Trash2, Copy, CheckCircle2, Loader2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

interface ApiToken {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  token?: string; // 只在创建时返回
}

export function ApiTokenSection() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/token/list');
      const data = await res.json();
      if (data.code === 200) {
        setTokens(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load tokens:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isExpanded && tokens.length === 0) {
      loadTokens();
    }
  }, [isExpanded, tokens.length, loadTokens]);

  const handleCreate = async () => {
    if (!newTokenName.trim()) {
      setError('请输入 Token 名称');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/token/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTokenName.trim() }),
      });
      const data = await res.json();

      if (data.code >= 400) {
        setError(data.message);
        return;
      }

      // 显示新创建的 Token（只显示一次）
      setNewToken(data.data.token);
      setNewTokenName('');
      
      // 添加到列表（不包含完整 token）
      setTokens(prev => [{
        ...data.data,
        token: undefined,
      }, ...prev]);
    } catch (err) {
      setError('创建失败，请重试');
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个 Token 吗？删除后使用此 Token 的服务将无法访问。')) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch('/api/token/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();

      if (data.code >= 400) {
        setError(data.message);
        return;
      }

      setTokens(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      setError('删除失败，请重试');
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = token;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
      <div
        className="p-4 border-b border-card-border/50 bg-card/50 flex items-center justify-between cursor-pointer hover:bg-card/80 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-foreground">API Token</h2>
          <span className="text-xs text-muted">（外部服务认证）</span>
        </div>
        <div className="flex items-center gap-2">
          {tokens.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
              {tokens.length} 个
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <p className="text-xs text-muted">
            API Token 用于外部服务（如 GitHub Actions）访问你的博客 API。Token 只在创建时显示一次，请妥善保管。
          </p>

          {/* 新创建的 Token 提示 */}
          {newToken && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">Token 创建成功！请立即复制保存</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-card rounded text-xs font-mono break-all">
                  {newToken}
                </code>
                <button
                  onClick={() => copyToken(newToken)}
                  className="p-2 hover:bg-card rounded transition-colors"
                  title="复制"
                >
                  {copied ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted" />
                  )}
                </button>
              </div>
              <p className="text-xs text-orange-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                此 Token 只显示一次，关闭后将无法再次查看
              </p>
              <button
                onClick={() => setNewToken(null)}
                className="text-xs text-muted hover:text-foreground underline"
              >
                我已保存，关闭提示
              </button>
            </div>
          )}

          {/* 创建新 Token */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder="Token 名称，如 GitHub Actions"
              className="flex-1 px-3 py-2 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              创建
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {error}
            </p>
          )}

          {/* Token 列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-8 text-muted text-sm">
              还没有创建任何 Token
            </div>
          ) : (
            <div className="space-y-2">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-3 bg-muted/20 border border-card-border/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground truncate">
                        {token.name}
                      </span>
                      <code className="text-xs text-muted bg-card px-1.5 py-0.5 rounded">
                        {token.tokenPrefix}
                      </code>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                      <span>创建于 {formatDate(token.createdAt)}</span>
                      {token.lastUsedAt && (
                        <span>最后使用 {formatDate(token.lastUsedAt)}</span>
                      )}
                      {token.expiresAt && (
                        <span className={new Date(token.expiresAt) < new Date() ? 'text-red-500' : ''}>
                          {new Date(token.expiresAt) < new Date() ? '已过期' : `${formatDate(token.expiresAt)} 过期`}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(token.id)}
                    disabled={deletingId === token.id}
                    className="p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                    title="删除"
                  >
                    {deletingId === token.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 使用说明 */}
          <div className="pt-4 border-t border-card-border/50">
            <p className="text-xs text-muted mb-2">使用方法：</p>
            <code className="block p-3 bg-muted/30 rounded-lg text-xs font-mono overflow-x-auto">
              curl -H &quot;Authorization: Bearer ink_xxxxx&quot; \<br />
              &nbsp;&nbsp;https://your-site.com/api/article/create-from-commit
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
