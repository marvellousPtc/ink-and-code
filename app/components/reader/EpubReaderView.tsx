'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import ePub, { type Book, type Rendition } from 'epubjs';
import type { ReadingSettingsData } from '@/lib/hooks/use-library';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface EpubReaderViewProps {
  url: string;
  bookId: string; // 用于代理 API
  initialLocation?: string;
  settings?: ReadingSettingsData | null;
  onProgressUpdate?: (percentage: number, location?: string) => void;
  onAddBookmark?: (location: string, title?: string) => void;
  onAddHighlight?: (text: string, location: string, color?: string) => void;
}

export default function EpubReaderView({
  bookId,
  initialLocation,
  settings,
  onProgressUpdate,
}: EpubReaderViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 通过代理 API 加载 EPUB，然后用 epubjs 渲染
  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    async function loadEpub() {
      try {
        // 通过代理获取 EPUB 二进制数据
        const res = await fetch(`/api/library/file?id=${bookId}`);
        if (!res.ok) throw new Error(`加载失败: ${res.status}`);
        const data = await res.arrayBuffer();

        if (destroyed) return;

        const book = ePub(data as unknown as string);
        bookRef.current = book;

        const rendition = book.renderTo(containerRef.current!, {
          width: '100%',
          height: '100%',
          spread: 'none',
          flow: 'paginated',
        });

        renditionRef.current = rendition;

        // 先注册事件再 display，避免丢失初始事件
        rendition.on('relocated', (location: { start: { cfi: string; percentage: number } }) => {
          const pct = Math.round((location.start.percentage || 0) * 100);
          onProgressUpdate?.(pct, location.start.cfi);
        });

        rendition.on('rendered', () => {
          if (!destroyed) setIsReady(true);
        });

        if (initialLocation) {
          rendition.display(initialLocation);
        } else {
          rendition.display();
        }

        // 生成位置信息（用于计算阅读百分比，不调用的话 percentage 始终为 0）
        book.ready.then(() => {
          return book.locations.generate(1024);
        }).then(() => {
          if (destroyed) return;
          // 位置生成后，刷新一次当前进度
          const loc = rendition.currentLocation() as unknown as { start?: { cfi: string; percentage: number } };
          if (loc?.start) {
            const pct = Math.round((loc.start.percentage || 0) * 100);
            onProgressUpdate?.(pct, loc.start.cfi);
          }
        });

        // 键盘翻页
        const handleKeydown = (e: KeyboardEvent) => {
          if (e.key === 'ArrowLeft') rendition.prev();
          else if (e.key === 'ArrowRight') rendition.next();
        };
        document.addEventListener('keydown', handleKeydown);

        // 清理函数中移除事件
        const cleanup = () => {
          document.removeEventListener('keydown', handleKeydown);
        };
        // 存到 ref 以便清理
        (containerRef.current as HTMLDivElement & { _cleanup?: () => void })._cleanup = cleanup;
      } catch (err) {
        console.error('Failed to load EPUB:', err);
        if (!destroyed) setLoadError(err instanceof Error ? err.message : '加载失败');
      }
    }

    loadEpub();

    return () => {
      destroyed = true;
      const el = containerRef.current as HTMLDivElement & { _cleanup?: () => void } | null;
      el?._cleanup?.();
      bookRef.current?.destroy();
      bookRef.current = null;
      renditionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // 应用阅读设置
  useEffect(() => {
    if (!renditionRef.current || !settings) return;

    const fontFamily =
      settings.fontFamily === 'serif' ? 'Georgia, "Times New Roman", serif' :
      settings.fontFamily === 'sans-serif' ? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' :
      settings.fontFamily === 'mono' ? '"SF Mono", "Fira Code", monospace' :
      'inherit';

    renditionRef.current.themes.default({
      'body, p, div, span': {
        'font-size': `${settings.fontSize}px !important`,
        'line-height': `${settings.lineHeight} !important`,
        'font-family': `${fontFamily} !important`,
      },
    });
  }, [settings?.fontSize, settings?.lineHeight, settings?.fontFamily, settings]);

  const handlePrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    renditionRef.current?.prev();
  }, []);

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    renditionRef.current?.next();
  }, []);

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm opacity-60 mb-2">EPUB 加载失败</p>
          <p className="text-xs opacity-40">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {isReady && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-0 top-0 bottom-0 w-16 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-6 h-6 opacity-40" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-0 top-0 bottom-0 w-16 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-6 h-6 opacity-40" />
          </button>
        </>
      )}

      {!isReady && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-inherit">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-current/10 border-t-current/60 rounded-full animate-spin" />
            <span className="text-xs opacity-50">正在解析 EPUB...</span>
          </div>
        </div>
      )}
    </div>
  );
}
