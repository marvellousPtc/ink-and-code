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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const animatingRef = useRef(false);

  // 掀页角翻页动画：右下角轻轻掀起
  const animatePageTurn = useCallback((direction: 'prev' | 'next') => {
    const rendition = renditionRef.current;
    const wrapper = wrapperRef.current;
    if (!rendition || !wrapper || animatingRef.current) return;

    animatingRef.current = true;

    // 掀起页角：绕底边做小幅度 rotateX，配合轻微位移
    const origin = direction === 'next' ? 'bottom right' : 'bottom left';
    wrapper.style.transformOrigin = origin;
    wrapper.style.transition = 'transform 280ms ease-in-out, opacity 250ms ease-in';
    wrapper.style.transform = 'rotateX(4deg) scale(0.97)';
    wrapper.style.opacity = '0.4';

    setTimeout(() => {
      if (direction === 'next') rendition.next();
      else rendition.prev();

      // 新页轻微抬起后落下
      wrapper.style.transition = 'none';
      wrapper.style.transform = 'rotateX(-3deg) scale(0.98)';
      wrapper.style.opacity = '0.5';

      void wrapper.offsetHeight;

      wrapper.style.transition = 'transform 250ms ease-out, opacity 200ms ease-out';
      wrapper.style.transform = 'rotateX(0deg) scale(1)';
      wrapper.style.opacity = '1';

      setTimeout(() => {
        animatingRef.current = false;
        wrapper.style.transition = '';
        wrapper.style.transform = '';
        wrapper.style.opacity = '';
        wrapper.style.transformOrigin = '';
      }, 260);
    }, 280);
  }, []);

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

  // --- 触摸手势：掀页角翻页 ---
  const touchRef = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const didPageTurnRef = useRef(false); // 标记最近一次 touch 是否触发了翻页

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
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const dx = e.touches[0].clientX - touchRef.current.x;
    const dy = e.touches[0].clientY - touchRef.current.y;

    if (!touchRef.current.moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      touchRef.current.moved = true;
    }

    if (touchRef.current.moved) {
      // 跟手掀页角：小幅度 rotateX + 轻微缩放，像掀开一角
      const screenWidth = window.innerWidth;
      const ratio = Math.min(1, Math.abs(dx) / (screenWidth * 0.4));
      const rotateX = ratio * 5; // 最多掀 5 度
      const scaleVal = 1 - ratio * 0.04; // 最多缩到 0.96
      const opacity = 1 - ratio * 0.5;

      wrapper.style.transition = 'none';
      wrapper.style.transformOrigin = dx < 0 ? 'bottom right' : 'bottom left';
      wrapper.style.transform = `rotateX(${rotateX}deg) scale(${scaleVal})`;
      wrapper.style.opacity = String(opacity);
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current || animatingRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    const dt = Date.now() - touchRef.current.t;
    const wasMoved = touchRef.current.moved;
    touchRef.current = null;

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

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

    if (shouldTurn && Math.abs(dx) > 20) {
      // 掀起翻页
      didPageTurnRef.current = true;
      animatingRef.current = true;
      const direction = dx > 0 ? 'prev' : 'next';
      const origin = direction === 'next' ? 'bottom right' : 'bottom left';

      wrapper.style.transformOrigin = origin;
      wrapper.style.transition = 'transform 220ms ease-in, opacity 200ms ease-in';
      wrapper.style.transform = 'rotateX(6deg) scale(0.95)';
      wrapper.style.opacity = '0.3';

      setTimeout(() => {
        if (direction === 'next') renditionRef.current?.next();
        else renditionRef.current?.prev();

        wrapper.style.transition = 'none';
        wrapper.style.transform = 'rotateX(-3deg) scale(0.97)';
        wrapper.style.opacity = '0.4';
        void wrapper.offsetHeight;

        wrapper.style.transition = 'transform 220ms ease-out, opacity 180ms ease-out';
        wrapper.style.transform = 'rotateX(0deg) scale(1)';
        wrapper.style.opacity = '1';

        setTimeout(() => {
          animatingRef.current = false;
          wrapper.style.transition = '';
          wrapper.style.transform = '';
          wrapper.style.opacity = '';
          wrapper.style.transformOrigin = '';
        }, 230);
      }, 220);
    } else {
      // 回弹
      wrapper.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
      wrapper.style.transform = 'rotateX(0deg) scale(1)';
      wrapper.style.opacity = '1';

      setTimeout(() => {
        wrapper.style.transition = '';
        wrapper.style.transform = '';
        wrapper.style.opacity = '';
        wrapper.style.transformOrigin = '';
      }, 210);
    }
  }, [animatePageTurn]);

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
    <div className="relative w-full h-full overflow-hidden" style={{ perspective: '800px' }}>
      {/* 动画 wrapper：掀页角效果 */}
      <div
        ref={wrapperRef}
        className="w-full h-full will-change-transform"
        style={{ transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
      >
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* 透明触摸层 */}
      {isReady && (
        <div
          className="absolute inset-0 z-10"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={(e) => {
            // 如果刚刚触摸翻了页，吞掉合成 click，不触发 toolbar 切换
            if (didPageTurnRef.current) {
              didPageTurnRef.current = false;
              e.stopPropagation();
              return;
            }
            // 左右区域是翻页区（桌面端鼠标点击），阻止冒泡
            // 只有中间区域点击才穿透到父级去 toggle toolbar
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
