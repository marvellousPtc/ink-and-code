'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { useSession } from 'next-auth/react';
import { MessageCircle, X, Send, Loader2, Bot, User, ChevronsRight, ChevronsLeft, LogIn, BrainCircuit } from 'lucide-react';
import Link from 'next/link';
import type { UIMessage } from 'ai';

function getMessageText(message: UIMessage): string {
  if (!message.parts || message.parts.length === 0) {
    return '';
  }
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

interface UsageInfo {
  authenticated: boolean;
  isAdmin?: boolean;
  used: number;
  limit: number;
  remaining: number;
}

export default function ChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isTucked, setIsTucked] = useState(false);
  const [input, setInput] = useState('');
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: session, status: authStatus } = useSession();
  const isAuthenticated = authStatus === 'authenticated' && !!session?.user;

  const { messages, sendMessage, status, error } = useChat();
  const isLoading = status === 'streaming' || status === 'submitted';

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/usage');
      if (res.ok) {
        setUsage(await res.json());
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchUsage();
    }
  }, [isOpen, fetchUsage]);

  // Refresh usage after each completed response
  useEffect(() => {
    if (status === 'ready' && messages.length > 0) {
      fetchUsage();
    }
  }, [status, messages.length, fetchUsage]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current && isAuthenticated) {
      inputRef.current.focus();
    }
  }, [isOpen, isAuthenticated]);

  const isRateLimited = usage && !usage.isAdmin && usage.remaining <= 0;

  return (
    <>
      {/* Tucked edge tab */}
      <button
        onClick={() => setIsTucked(false)}
        className={`fixed bottom-6 z-50 transition-all duration-300 ease-in-out cursor-pointer ${
          isTucked
            ? 'right-0 opacity-100'
            : 'right-[-60px] opacity-0 pointer-events-none'
        }`}
        aria-label="展开 AI 助手"
      >
        <div className="flex items-center gap-1 bg-primary text-background pl-2.5 pr-1.5 py-2.5 rounded-l-xl shadow-lg hover:pr-3 transition-all duration-200">
          <ChevronsLeft className="w-4 h-4" />
          <MessageCircle className="w-4 h-4" />
        </div>
      </button>

      {/* Floating button + tuck button */}
      <div
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 transition-all duration-300 ease-in-out ${
          isTucked ? 'translate-x-[80px] opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'
        }`}
      >
        {!isOpen && (
          <button
            onClick={() => setIsTucked(true)}
            className="w-7 h-7 rounded-full bg-card/80 backdrop-blur-sm border border-card-border/40 shadow-md flex items-center justify-center text-muted/50 hover:text-muted/80 hover:bg-card transition-colors cursor-pointer"
            aria-label="藏到边缘"
            title="收起到右侧"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-14 h-14 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center cursor-pointer ${
            isOpen
              ? 'bg-card-border text-foreground rotate-90'
              : 'bg-primary text-background hover:scale-110'
          }`}
          aria-label={isOpen ? '关闭对话' : '打开 AI 助手'}
        >
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <MessageCircle className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Chat panel */}
      <div
        className={`fixed z-50 bg-card border border-card-border rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 bottom-20 right-3 left-3 h-[calc(100vh-140px)] sm:bottom-24 sm:right-6 sm:left-auto sm:w-[380px] sm:h-[500px] ${
          isOpen && !isTucked
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-sm">AI 助手</h3>
              <p className="text-xs text-muted">有什么可以帮助你的？</p>
            </div>
          </div>
          {/* Usage badge */}
          {isAuthenticated && usage && !usage.isAdmin && (
            <div className="text-xs text-muted bg-card-border/30 px-2 py-1 rounded-lg">
              {usage.remaining}/{usage.limit}
            </div>
          )}
          {isAuthenticated && usage?.isAdmin && (
            <div className="text-xs text-primary bg-primary/10 px-2 py-1 rounded-lg font-medium">
              Admin
            </div>
          )}
        </div>

        {/* Content area */}
        {!isAuthenticated ? (
          /* Not logged in: show login prompt */
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
                <BrainCircuit className="w-8 h-8 text-primary opacity-50" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">登录后即可使用 AI 助手</p>
                <p className="text-xs text-muted">智能对话、联网搜索、写作辅助</p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>去登录</span>
              </Link>
              <div className="pt-2">
                <a
                  href="/chat"
                  className="text-xs text-muted hover:text-foreground transition-colors underline underline-offset-2"
                >
                  或体验完整版 AI 助手 &rarr;
                </a>
              </div>
            </div>
          </div>
        ) : (
          /* Logged in: show messages */
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-muted">
                    <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">开始和 AI 助手对话吧</p>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === 'user' ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        message.role === 'user'
                          ? 'bg-primary/10'
                          : 'bg-card-border'
                      }`}
                    >
                      {message.role === 'user' ? (
                        <User className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 text-muted" />
                      )}
                    </div>
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                        message.role === 'user'
                          ? 'bg-primary text-background rounded-br-md'
                          : 'bg-card-border/50 text-foreground rounded-bl-md'
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">
                        {getMessageText(message)}
                      </div>
                    </div>
                  </div>
                ))
              )}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-card-border flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-muted" />
                  </div>
                  <div className="bg-card-border/50 px-3 py-2 rounded-2xl rounded-bl-md">
                    <Loader2 className="w-4 h-4 animate-spin text-muted" />
                  </div>
                </div>
              )}

              {error && (
                <div className="text-center text-red-400 text-xs py-2">
                  {error.message || '发生错误，请重试'}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            {isRateLimited ? (
              <div className="p-3 border-t border-card-border text-center space-y-2">
                <p className="text-xs text-muted">今日免费额度已用完</p>
                <a
                  href="/chat"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <BrainCircuit className="w-3 h-3" />
                  前往完整版 AI 助手
                </a>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (input.trim() && !isLoading) {
                    sendMessage({ text: input });
                    setInput('');
                  }
                }}
                className="p-3 border-t border-card-border"
              >
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="输入消息..."
                    disabled={isLoading}
                    className="flex-1 px-4 py-2.5 bg-background border border-card-border rounded-xl text-sm focus:outline-none focus:border-primary/50 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="px-4 py-2.5 bg-primary text-background rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </>
  );
}
