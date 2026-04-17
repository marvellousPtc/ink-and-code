'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles,
  BookOpen,
  Languages,
  FileText,
  MessageCircleQuestion,
  Loader2,
  X,
  Check,
  Copy,
  RotateCcw,
  Bookmark,
  ArrowRight,
} from 'lucide-react';

interface AiReadingMenuProps {
  /** 菜单位置（相对于阅读器 book-frame） */
  position: { x: number; y: number };
  /** true = 弹窗在文字下方（顶部空间不足时） */
  flipDown?: boolean;
  /** 选中的原文 */
  text: string;
  /** 选中的高亮位置（用于存为笔记时附加到 highlight） */
  location: string;
  /** 存为笔记：创建带 note 字段的高亮 */
  onAddHighlight?: (text: string, location: string, color?: string, note?: string) => void;
  /** 关闭菜单 */
  onClose: () => void;
}

type Action = 'explain' | 'translate_zh' | 'translate_en' | 'summarize' | 'ask';

const ACTIONS: { id: Action; label: string; icon: React.ReactNode }[] = [
  { id: 'explain', label: '解释', icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: 'translate_zh', label: '译为中文', icon: <Languages className="w-3.5 h-3.5" /> },
  { id: 'translate_en', label: '译为英文', icon: <Languages className="w-3.5 h-3.5" /> },
  { id: 'summarize', label: '总结', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'ask', label: '向 AI 提问', icon: <MessageCircleQuestion className="w-3.5 h-3.5" /> },
];

export default function AiReadingMenu({
  position, flipDown, text, location, onAddHighlight, onClose,
}: AiReadingMenuProps) {
  const [stage, setStage] = useState<'actions' | 'ask-input' | 'result'>('actions');
  const [currentAction, setCurrentAction] = useState<Action | null>(null);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const askInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === 'ask-input') {
      setTimeout(() => askInputRef.current?.focus(), 50);
    }
  }, [stage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runAction = useCallback(async (action: Action, q?: string) => {
    setCurrentAction(action);
    setStage('result');
    setResult('');
    setError('');
    setLoading(true);
    setCopied(false);
    setSaved(false);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/ai/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, action, question: q }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        let msg = 'AI 处理失败';
        try {
          const data = await res.json();
          msg = data.error || msg;
        } catch { /* ignore */ }
        if (res.status === 401) msg = '请先登录后再使用 AI';
        setError(msg);
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              accumulated += data.content;
              setResult(accumulated);
            }
          } catch {
            // skip
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError('请求失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  }, [text]);

  const handlePickAction = useCallback((action: Action) => {
    if (action === 'ask') {
      setCurrentAction(action);
      setQuestion('');
      setStage('ask-input');
      return;
    }
    runAction(action);
  }, [runAction]);

  const handleSubmitAsk = useCallback(() => {
    const q = question.trim();
    if (!q) return;
    runAction('ask', q);
  }, [question, runAction]);

  const handleAskKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitAsk();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [handleSubmitAsk, onClose]);

  const handleRetry = useCallback(() => {
    if (!currentAction) return;
    if (currentAction === 'ask') {
      runAction('ask', question.trim());
    } else {
      runAction(currentAction);
    }
  }, [currentAction, question, runAction]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [result]);

  const handleSaveAsNote = useCallback(() => {
    if (!result || !onAddHighlight) return;
    const label = ACTIONS.find(a => a.id === currentAction)?.label || 'AI';
    const prefix = currentAction === 'ask' && question.trim()
      ? `[AI · ${label}] ${question.trim()}\n`
      : `[AI · ${label}]\n`;
    onAddHighlight(text, location, 'yellow', prefix + result);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 900);
  }, [result, onAddHighlight, currentAction, question, text, location, onClose]);

  const actionLabel = currentAction
    ? ACTIONS.find(a => a.id === currentAction)?.label
    : '';

  return (
    <div
      className="hl-ai-menu"
      style={{
        left: position.x,
        top: position.y,
        transform: flipDown
          ? 'translate(-50%, 0%) translateY(12px)'
          : 'translate(-50%, -100%) translateY(-12px)',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* 头部 */}
      <div className="hl-ai-header">
        <div className="hl-ai-title">
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {stage === 'actions' && 'AI 阅读助手'}
            {stage === 'ask-input' && '向 AI 提问'}
            {stage === 'result' && `${actionLabel}`}
          </span>
        </div>
        <button className="hl-ai-close" onClick={onClose} title="关闭">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 引用的原文片段 */}
      {stage !== 'result' && (
        <div className="hl-ai-quote">
          &ldquo;{text.length > 90 ? text.slice(0, 90) + '…' : text}&rdquo;
        </div>
      )}

      {/* 阶段 1：action 选择 */}
      {stage === 'actions' && (
        <div className="hl-ai-actions">
          {ACTIONS.map(a => (
            <button
              key={a.id}
              className="hl-ai-action"
              onClick={() => handlePickAction(a.id)}
            >
              <span className="hl-ai-action-icon">{a.icon}</span>
              <span className="hl-ai-action-label">{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 阶段 2：提问输入 */}
      {stage === 'ask-input' && (
        <div className="hl-ai-ask">
          <input
            ref={askInputRef}
            className="hl-ai-input"
            type="text"
            placeholder="想问点什么？按回车提交"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleAskKeyDown}
          />
          <div className="hl-ai-ask-actions">
            <button
              className="hl-ai-btn hl-ai-btn-ghost"
              onClick={() => setStage('actions')}
            >
              返回
            </button>
            <button
              className="hl-ai-btn hl-ai-btn-primary"
              onClick={handleSubmitAsk}
              disabled={!question.trim()}
            >
              <ArrowRight className="w-3 h-3" />
              提问
            </button>
          </div>
        </div>
      )}

      {/* 阶段 3：结果 */}
      {stage === 'result' && (
        <>
          {/* 原文小卡片 */}
          <div className="hl-ai-quote hl-ai-quote-sm">
            &ldquo;{text.length > 60 ? text.slice(0, 60) + '…' : text}&rdquo;
          </div>
          {currentAction === 'ask' && question.trim() && (
            <div className="hl-ai-question">
              <MessageCircleQuestion className="w-3 h-3 shrink-0 opacity-60" />
              <span>{question.trim()}</span>
            </div>
          )}

          <div className="hl-ai-result">
            {error ? (
              <p className="hl-ai-error">{error}</p>
            ) : (
              <p className="hl-ai-result-text">{result}</p>
            )}
            {loading && (
              <Loader2 className="hl-ai-spinner w-3.5 h-3.5 animate-spin" />
            )}
          </div>

          {/* 底部操作 */}
          {!loading && (result || error) && (
            <div className="hl-ai-footer">
              {result && !error && (
                <>
                  <button className="hl-ai-btn hl-ai-btn-ghost" onClick={handleCopy}>
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                  {onAddHighlight && (
                    <button className="hl-ai-btn hl-ai-btn-primary" onClick={handleSaveAsNote}>
                      {saved ? <Check className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
                      {saved ? '已保存' : '存为笔记'}
                    </button>
                  )}
                </>
              )}
              <button className="hl-ai-btn hl-ai-btn-ghost" onClick={handleRetry}>
                <RotateCcw className="w-3 h-3" />
                重试
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
