'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Editor } from '@tiptap/react';
import {
  Sparkles,
  ArrowRight,
  Languages,
  Eraser,
  Expand,
  PenLine,
  FileText,
  Briefcase,
  MessageCircle,
  X,
  Loader2,
  Check,
  RotateCcw,
} from 'lucide-react';

interface AiWritingMenuProps {
  editor: Editor;
}

interface AiAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: string;
}

const AI_ACTIONS: AiAction[] = [
  { id: 'continue', label: '续写', icon: <ArrowRight className="w-3.5 h-3.5" />, action: 'continue' },
  { id: 'rewrite', label: '改写', icon: <PenLine className="w-3.5 h-3.5" />, action: 'rewrite' },
  { id: 'expand', label: '扩展', icon: <Expand className="w-3.5 h-3.5" />, action: 'expand' },
  { id: 'summarize', label: '总结', icon: <FileText className="w-3.5 h-3.5" />, action: 'summarize' },
  { id: 'translate_en', label: '译为英文', icon: <Languages className="w-3.5 h-3.5" />, action: 'translate_en' },
  { id: 'translate_zh', label: '译为中文', icon: <Languages className="w-3.5 h-3.5" />, action: 'translate_zh' },
  { id: 'formal', label: '正式语气', icon: <Briefcase className="w-3.5 h-3.5" />, action: 'formal' },
  { id: 'casual', label: '轻松语气', icon: <MessageCircle className="w-3.5 h-3.5" />, action: 'casual' },
  { id: 'fix_grammar', label: '修正语法', icon: <Eraser className="w-3.5 h-3.5" />, action: 'fix_grammar' },
];

export default function AiWritingMenu({ editor }: AiWritingMenuProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [currentAction, setCurrentAction] = useState('');
  const [error, setError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const selectedText = useCallback(() => {
    const { from, to } = editor.state.selection;
    if (from === to) return '';
    return editor.state.doc.textBetween(from, to, ' ');
  }, [editor]);

  const checkSelection = useCallback(() => {
    const text = selectedText();
    if (text.length > 2 && !loading && !result) {
      const { view } = editor;
      const { from, to } = view.state.selection;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);

      setPosition({
        top: start.top - 44,
        left: (start.left + end.left) / 2,
      });
      setVisible(true);
    } else if (!text && !result) {
      setVisible(false);
    }
  }, [editor, selectedText, loading, result]);

  useEffect(() => {
    editor.on('selectionUpdate', checkSelection);
    editor.on('transaction', checkSelection);

    const editorDom = editor.view.dom;
    editorDom.addEventListener('mouseup', checkSelection);
    editorDom.addEventListener('keyup', checkSelection);

    return () => {
      editor.off('selectionUpdate', checkSelection);
      editor.off('transaction', checkSelection);
      editorDom.removeEventListener('mouseup', checkSelection);
      editorDom.removeEventListener('keyup', checkSelection);
    };
  }, [editor, checkSelection]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        result
      ) {
        handleDiscard();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [result]);

  const handleAiAction = async (action: string) => {
    const text = selectedText();
    if (!text) return;

    setLoading(true);
    setCurrentAction(action);
    setResult('');
    setError('');

    try {
      const res = await fetch('/api/ai/writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, action }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'AI 处理失败');
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
    } catch {
      setError('请求失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = () => {
    if (!result) return;
    const { from, to } = editor.state.selection;
    if (currentAction === 'continue') {
      editor.chain().focus().setTextSelection(to).insertContent(result).run();
    } else {
      editor.chain().focus().deleteRange({ from, to }).insertContent(result).run();
    }
    handleDiscard();
  };

  const handleDiscard = () => {
    setResult('');
    setError('');
    setCurrentAction('');
    setVisible(false);
  };

  if (!visible) return null;

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[9999] animate-in fade-in zoom-in-95 duration-150"
      style={{ top: `${position.top}px`, left: `${position.left}px`, transform: 'translateX(-50%)' }}
    >
      {!result && !error ? (
        <div className="flex items-center gap-0.5 px-1.5 py-1 bg-background border border-border rounded-xl shadow-lg">
          <div className="flex items-center gap-0.5 pr-1.5 mr-0.5 border-r border-border">
            <Sparkles className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">AI</span>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {AI_ACTIONS.find(a => a.action === currentAction)?.label}中...
              </span>
            </div>
          ) : (
            AI_ACTIONS.map((item) => (
              <button
                key={item.id}
                onClick={() => handleAiAction(item.action)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer whitespace-nowrap"
                title={item.label}
              >
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="w-[420px] max-w-[90vw] bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-accent/30">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-xs font-medium">
                {AI_ACTIONS.find(a => a.action === currentAction)?.label}结果
              </span>
            </div>
            <button onClick={handleDiscard} className="p-1 rounded hover:bg-accent cursor-pointer">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <div ref={resultRef} className="p-3 max-h-[200px] overflow-y-auto">
            {error ? (
              <p className="text-xs text-red-500">{error}</p>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{result}</p>
            )}
            {loading && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground mt-1 inline-block" />
            )}
          </div>
          {!loading && result && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
              <button
                onClick={handleAccept}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer"
              >
                <Check className="w-3 h-3" />
                替换
              </button>
              <button
                onClick={() => handleAiAction(currentAction)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                重试
              </button>
              <button
                onClick={handleDiscard}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                取消
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
