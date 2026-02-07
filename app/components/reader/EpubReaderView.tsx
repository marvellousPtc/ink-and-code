'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import ePub, { type Book, type Rendition } from 'epubjs';
import type { ReadingSettingsData } from '@/lib/hooks/use-library';

interface EpubReaderViewProps {
  url: string;
  bookId: string;
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
  const curlRef = useRef<HTMLDivElement>(null);
  const curlShadowRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const animatingRef = useRef(false);

  // ---- 掀页角：更新翻卷大小 ----
  const updateCurl = useCallback((size: number, direction: 'next' | 'prev') => {
    const curl = curlRef.current;
    const shadow = curlShadowRef.current;
    if (!curl || !shadow) return;

    const isNext = direction === 'next';

    if (size <= 0) {
      curl.style.width = '0';
      curl.style.height = '0';
      curl.style.opacity = '0';
      shadow.style.width = '0';
      shadow.style.height = '0';
      shadow.style.opacity = '0';
      return;
    }

    // 翻卷三角形
    curl.style.width = `${size}px`;
    curl.style.height = `${size}px`;
    curl.style.opacity = '1';
    curl.style.bottom = '0';
    curl.style.right = isNext ? '0' : 'auto';
    curl.style.left = isNext ? 'auto' : '0';

    if (isNext) {
      curl.style.clipPath = 'polygon(100% 0%, 0% 100%, 100% 100%)';
      curl.style.background = [
        'linear-gradient(315deg, transparent 44%, rgba(255,255,255,0.5) 48%, rgba(0,0,0,0.06) 52%, transparent 56%)',
        'linear-gradient(315deg, #dedad4 0%, #eeece7 30%, #f7f5f2 55%, #fdfcfb 100%)',
      ].join(', ');
      curl.style.boxShadow = '-3px -3px 8px rgba(0,0,0,0.12), -1px -1px 3px rgba(0,0,0,0.06)';
    } else {
      curl.style.clipPath = 'polygon(0% 0%, 0% 100%, 100% 100%)';
      curl.style.background = [
        'linear-gradient(45deg, transparent 44%, rgba(255,255,255,0.5) 48%, rgba(0,0,0,0.06) 52%, transparent 56%)',
        'linear-gradient(45deg, #dedad4 0%, #eeece7 30%, #f7f5f2 55%, #fdfcfb 100%)',
      ].join(', ');
      curl.style.boxShadow = '3px -3px 8px rgba(0,0,0,0.12), 1px -1px 3px rgba(0,0,0,0.06)';
    }

    // 底部阴影
    const shadowSize = size * 1.15;
    shadow.style.width = `${shadowSize}px`;
    shadow.style.height = `${shadowSize}px`;
    shadow.style.bottom = '0';
    shadow.style.right = isNext ? '0' : 'auto';
    shadow.style.left = isNext ? 'auto' : '0';
    shadow.style.opacity = String(Math.min(0.5, size / 250));
    shadow.style.background = isNext
      ? 'radial-gradient(ellipse at bottom right, rgba(0,0,0,0.22) 0%, transparent 65%)'
      : 'radial-gradient(ellipse at bottom left, rgba(0,0,0,0.22) 0%, transparent 65%)';
  }, []);

  // ---- 掀角翻页动画 ----
  const animatePageTurn = useCallback((direction: 'prev' | 'next') => {
    const rendition = renditionRef.current;
    if (!rendition || animatingRef.current) return;

    animatingRef.current = true;
    const curl = curlRef.current;
    const shadow = curlShadowRef.current;

    const rect = containerRef.current?.getBoundingClientRect();
    const maxSize = rect ? Math.min(rect.width, rect.height) * 0.5 : 160;

    // Phase 1 —— 掀角展开
    if (curl) curl.style.transition = 'width 320ms ease-out, height 320ms ease-out, opacity 200ms ease-out';
    if (shadow) shadow.style.transition = 'width 320ms ease-out, height 320ms ease-out, opacity 320ms ease-out';
    updateCurl(maxSize, direction);

    setTimeout(() => {
      // 换页
      if (direction === 'next') rendition.next();
      else rendition.prev();

      // Phase 2 —— 掀角收回
      if (curl) curl.style.transition = 'width 250ms ease-in, height 250ms ease-in, opacity 180ms ease-in 70ms';
      if (shadow) shadow.style.transition = 'width 250ms ease-in, height 250ms ease-in, opacity 220ms ease-in';
      updateCurl(0, direction);

      setTimeout(() => {
        animatingRef.current = false;
        if (curl) curl.style.transition = '';
        if (shadow) shadow.style.transition = '';
      }, 260);
    }, 330);
  }, [updateCurl]);

  // 加载 EPUB
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    let destroyed = false;
    let locationsTimer: ReturnType<typeof setTimeout>;

    async function loadEpub() {
      try {
        const res = await fetch(`/api/library/file?id=${bookId}`);
        if (!res.ok) throw new Error(`加载失败: ${res.status}`);
        const data = await res.arrayBuffer();

        if (destroyed) return;

        const book = ePub(data as unknown as string);
        bookRef.current = book;

        const rendition = book.renderTo(container, {
          width: '100%',
          height: '100%',
          spread: 'none',
          flow: 'paginated',
          allowScriptedContent: false,
        });

        renditionRef.current = rendition;

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

        // 延迟生成位置信息
        locationsTimer = setTimeout(() => {
          if (destroyed) return;
          book.ready.then(() => book.locations.generate(2048)).then(() => {
            if (destroyed) return;
            const loc = rendition.currentLocation() as unknown as { start?: { cfi: string; percentage: number } };
            if (loc?.start) {
              const pct = Math.round((loc.start.percentage || 0) * 100);
              onProgressUpdate?.(pct, loc.start.cfi);
            }
          });
        }, 2000);

        // 键盘翻页
        const handleKeydown = (e: KeyboardEvent) => {
          if (e.key === 'ArrowLeft') animatePageTurn('prev');
          else if (e.key === 'ArrowRight') animatePageTurn('next');
        };
        document.addEventListener('keydown', handleKeydown);

        const cleanup = () => {
          document.removeEventListener('keydown', handleKeydown);
        };
        (container as HTMLDivElement & { _cleanup?: () => void })._cleanup = cleanup;
      } catch (err) {
        console.error('Failed to load EPUB:', err);
        if (!destroyed) setLoadError(err instanceof Error ? err.message : '加载失败');
      }
    }

    loadEpub();

    return () => {
      destroyed = true;
      clearTimeout(locationsTimer);
      (container as HTMLDivElement & { _cleanup?: () => void })?._cleanup?.();
      bookRef.current?.destroy();
      bookRef.current = null;
      renditionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // 监听容器尺寸变化，自动重排
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !renditionRef.current) return;

    let resizeTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const rect = container.getBoundingClientRect();
        renditionRef.current?.resize(rect.width, rect.height);
      }, 150);
    });
    ro.observe(container);
    return () => {
      clearTimeout(resizeTimer);
      ro.disconnect();
    };
  }, [isReady]);

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

  // ---- 触摸手势：掀角跟手 ----
  const touchRef = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const didPageTurnRef = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (animatingRef.current) return;
    touchRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      t: Date.now(),
      moved: false,
    };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current || animatingRef.current) return;

    const dx = e.touches[0].clientX - touchRef.current.x;
    const dy = e.touches[0].clientY - touchRef.current.y;

    if (!touchRef.current.moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      touchRef.current.moved = true;
    }

    if (touchRef.current.moved) {
      const curl = curlRef.current;
      const shadow = curlShadowRef.current;
      if (!curl || !shadow) return;

      // 跟手掀角：拖动距离映射到翻卷大小
      const rect = containerRef.current?.getBoundingClientRect();
      const maxSize = rect ? Math.min(rect.width, rect.height) * 0.5 : 160;
      const screenWidth = window.innerWidth;
      const ratio = Math.min(1, Math.abs(dx) / (screenWidth * 0.4));
      const size = ratio * maxSize;
      const isNext = dx < 0;

      curl.style.transition = 'none';
      shadow.style.transition = 'none';
      updateCurl(size, isNext ? 'next' : 'prev');
    }
  }, [updateCurl]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current || animatingRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    const dt = Date.now() - touchRef.current.t;
    const wasMoved = touchRef.current.moved;
    touchRef.current = null;

    const curl = curlRef.current;
    const shadow = curlShadowRef.current;

    // 点击翻页
    if (!wasMoved) {
      const tapX = e.changedTouches[0].clientX;
      const screenWidth = window.innerWidth;
      if (tapX < screenWidth * 0.3) {
        didPageTurnRef.current = true;
        animatePageTurn('prev');
      } else if (tapX > screenWidth * 0.7) {
        didPageTurnRef.current = true;
        animatePageTurn('next');
      }
      return;
    }

    const velocity = Math.abs(dx) / Math.max(dt, 1);
    const shouldTurn = velocity > 0.4 || Math.abs(dx) > 60;
    const isNext = dx < 0;
    const dir = isNext ? 'next' as const : 'prev' as const;

    if (shouldTurn && Math.abs(dx) > 20) {
      // 完成翻页：掀角展开到最大 → 换页 → 收回
      didPageTurnRef.current = true;
      animatingRef.current = true;

      const rect = containerRef.current?.getBoundingClientRect();
      const maxSize = rect ? Math.min(rect.width, rect.height) * 0.5 : 160;

      if (curl) curl.style.transition = 'width 200ms ease-out, height 200ms ease-out';
      if (shadow) shadow.style.transition = 'width 200ms ease-out, height 200ms ease-out, opacity 200ms ease-out';
      updateCurl(maxSize, dir);

      setTimeout(() => {
        if (isNext) renditionRef.current?.next();
        else renditionRef.current?.prev();

        // 收回
        if (curl) curl.style.transition = 'width 250ms ease-in, height 250ms ease-in, opacity 180ms ease-in 70ms';
        if (shadow) shadow.style.transition = 'width 250ms ease-in, height 250ms ease-in, opacity 220ms ease-in';
        updateCurl(0, dir);

        setTimeout(() => {
          animatingRef.current = false;
          if (curl) curl.style.transition = '';
          if (shadow) shadow.style.transition = '';
        }, 260);
      }, 210);
    } else {
      // 回弹：掀角不够大，弹回原位
      if (curl) curl.style.transition = 'width 280ms cubic-bezier(0.0, 0, 0.2, 1), height 280ms cubic-bezier(0.0, 0, 0.2, 1), opacity 250ms ease-out';
      if (shadow) shadow.style.transition = 'width 280ms cubic-bezier(0.0, 0, 0.2, 1), height 280ms cubic-bezier(0.0, 0, 0.2, 1), opacity 250ms ease-out';
      updateCurl(0, dir);

      setTimeout(() => {
        if (curl) curl.style.transition = '';
        if (shadow) shadow.style.transition = '';
      }, 290);
    }
  }, [animatePageTurn, updateCurl]);

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
    <div className="relative w-full h-full overflow-hidden">
      {/* EPUB 内容 */}
      <div ref={containerRef} className="w-full h-full" />

      {/* 掀角阴影（在翻卷三角形下面） */}
      <div
        ref={curlShadowRef}
        className="absolute pointer-events-none"
        style={{ opacity: 0, zIndex: 5 }}
      />

      {/* 掀角三角形（折回的纸张） */}
      <div
        ref={curlRef}
        className="absolute pointer-events-none"
        style={{ opacity: 0, zIndex: 6 }}
      />

      {/* 透明触摸层 */}
      {isReady && (
        <div
          className="absolute inset-0 z-10"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={(e) => {
            if (didPageTurnRef.current) {
              didPageTurnRef.current = false;
              e.stopPropagation();
              return;
            }
            const clickX = e.clientX;
            const screenWidth = window.innerWidth;
            if (clickX < screenWidth * 0.3 || clickX > screenWidth * 0.7) {
              e.stopPropagation();
              animatePageTurn(clickX < screenWidth * 0.3 ? 'prev' : 'next');
            }
          }}
          style={{ touchAction: 'pan-y' }}
        />
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
