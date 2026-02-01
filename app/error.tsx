'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 记录错误到控制台（生产环境可以发送到错误追踪服务）
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
          <span className="text-4xl">⚠️</span>
        </div>
        <h2 className="serif text-2xl font-bold text-foreground mb-4">
          出错了
        </h2>
        <p className="text-muted mb-8 leading-relaxed">
          页面加载时发生错误，请尝试刷新页面。
          <br />
          如果问题持续存在，请稍后再试。
        </p>
        <button
          onClick={() => reset()}
          className="px-6 py-3 bg-primary text-background rounded-xl font-medium hover:bg-primary/90 transition-colors"
        >
          重新加载
        </button>
      </div>
    </div>
  );
}
