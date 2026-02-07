'use client';

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from 'react';
import HTMLFlipBook from 'react-pageflip';
import { useEpubContent } from '@/lib/hooks/use-epub-content';
import {
  useBookPagination,
  getChapterForPage,
} from '@/lib/hooks/use-book-pagination';
import type { ReadingSettingsData } from '@/lib/hooks/use-library';
import BookPage from './BookPage';
import './epub-reader.css';

/** 懒渲染窗口：只有距离当前页 ±LAZY_WINDOW 范围内的页面才渲染真实内容 */
const LAZY_WINDOW = 4;

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
  // ---- 容器尺寸 ----
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- EPUB 内容解析 ----
  const { chapters, styles: epubStyles, isLoading, error } = useEpubContent(bookId);

  // ---- 响应式：判断是否为移动端（单页模式） ----
  const isMobile = containerSize.w > 0 && containerSize.w < 768;

  // ---- 计算单页尺寸 ----
  const pageDimensions = useMemo(() => {
    if (containerSize.w === 0 || containerSize.h === 0) {
      return { pageW: 400, pageH: 560 };
    }

    const availH = containerSize.h - 32; // 上下留白

    if (isMobile) {
      // 移动端：单页全宽，减少边距以最大化阅读面积
      const pageW = Math.min(containerSize.w - 8, 600);
      const pageH = Math.min(availH, pageW * 1.5);
      return { pageW, pageH };
    }

    const maxBookWidth = containerSize.w - 48;
    const singlePageW = Math.min(Math.floor(maxBookWidth / 2), 520);
    const singlePageH = Math.min(availH, singlePageW * 1.4);

    return {
      pageW: singlePageW,
      pageH: singlePageH,
    };
  }, [containerSize, isMobile]);

  // ---- 内容区域尺寸（去除 padding 和页码空间） ----
  // 移动端用更小的 padding（20px），桌面端 40px
  const pagePadding = isMobile ? 20 : 40;
  const contentWidth = Math.max(200, pageDimensions.pageW - pagePadding * 2);
  const contentHeight = Math.max(200, pageDimensions.pageH - pagePadding * 2 - 30);

  // ---- 分页 ----
  const pagination = useBookPagination(
    chapters,
    epubStyles,
    settings,
    contentWidth,
    contentHeight,
  );

  // ---- 当前页 ----
  const initialPage = useMemo(() => {
    if (!initialLocation || !initialLocation.startsWith('page:')) return 0;
    const parsed = parseInt(initialLocation.replace('page:', ''), 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }, [initialLocation]);

  const startPage = useMemo(() => {
    if (!pagination.isReady) return 0;
    return Math.min(initialPage, Math.max(0, pagination.totalPages - 1));
  }, [pagination.isReady, pagination.totalPages, initialPage]);

  const [currentPage, setCurrentPage] = useState(0);
  const [showBook, setShowBook] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipBookRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const prevTotalRef = useRef(0);
  const flipTargetRef = useRef(0);
  const currentPageRef = useRef(0);

  // 首次分页完成后设置正确的起始页，避免先显示第0页再跳转的闪烁
  useEffect(() => {
    if (!pagination.isReady) return;

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevTotalRef.current = pagination.totalPages;
      flipTargetRef.current = startPage;
      currentPageRef.current = startPage;

      // 延迟显示翻页书，等待 HTMLFlipBook 在正确页面初始化
      setTimeout(() => {
        // 确保 FlipBook 在正确页码
        if (startPage > 0) {
          flipBookRef.current?.pageFlip()?.turnToPage(startPage);
        }
        setCurrentPage(startPage);
        setShowBook(true);
      }, 150);
    } else if (prevTotalRef.current > 0 && pagination.totalPages !== prevTotalRef.current) {
      const ratio = currentPageRef.current / Math.max(1, prevTotalRef.current - 1);
      const newPage = Math.min(
        Math.round(ratio * (pagination.totalPages - 1)),
        pagination.totalPages - 1,
      );
      prevTotalRef.current = pagination.totalPages;

      setTimeout(() => {
        flipBookRef.current?.pageFlip()?.turnToPage(Math.max(0, newPage));
      }, 100);
    }
  }, [pagination.isReady, pagination.totalPages, startPage]);

  // ---- 翻页事件 ----
  const handleFlip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      flipTargetRef.current = e.data as number;
    },
    [],
  );

  const handleChangeState = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      if (e.data === 'read') {
        const page = flipTargetRef.current;
        currentPageRef.current = page;
        setCurrentPage(page);

        if (pagination.totalPages > 0) {
          const pct = Math.round((page / Math.max(1, pagination.totalPages - 1)) * 100);
          onProgressUpdate?.(pct, `page:${page}`);
        }
      }
    },
    [pagination.totalPages, onProgressUpdate],
  );

  // ---- 键盘翻页 ----
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const pageFlip = flipBookRef.current?.pageFlip();
      if (!pageFlip) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        pageFlip.flipNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        pageFlip.flipPrev();
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  // ---- 主题 ----
  const theme = settings?.theme || 'light';
  const themeClass =
    theme === 'dark' ? 'book-theme-dark' :
    theme === 'sepia' ? 'book-theme-sepia' : '';

  // ---- 排版设置 ----
  const fontSize = settings?.fontSize ?? 16;
  const lineHeightVal = settings?.lineHeight ?? 1.8;
  const fontFamily = settings?.fontFamily ?? 'system';

  // ---- 是否就绪 ----
  const contentParsed = !isLoading && !error;
  const ready = contentParsed && pagination.isReady && pagination.totalPages > 0 && containerSize.w > 0;
  const emptyContent = contentParsed && pagination.isReady && pagination.totalPages === 0 && chapters.length === 0;

  // ---- 构建页面数据 ----
  // 性能关键：在父组件决定是否传递 chapterHtml（懒渲染），
  // 避免把 currentPage 传给每个 BookPage 导致 2000+ 个组件的 memo 比较。
  const pages = useMemo(() => {
    if (!ready) return [];
    return Array.from({ length: pagination.totalPages }, (_, i) => {
      const info = getChapterForPage(i, pagination.chapterPageRanges);
      return {
        pageIndex: i,
        chapterIndex: info?.chapterIndex ?? 0,
        pageInChapter: info?.pageInChapter ?? 0,
      };
    });
  }, [ready, pagination.totalPages, pagination.chapterPageRanges]);

  return (
    <div ref={containerRef} className={`book-container ${themeClass}`}>
      {error && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-sm opacity-60 mb-2">EPUB 加载失败</p>
            <p className="text-xs opacity-40">{error}</p>
          </div>
        </div>
      )}

      {emptyContent && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-sm opacity-60 mb-2">EPUB 内容为空</p>
            <p className="text-xs opacity-40">未能从该文件中提取到任何章节内容</p>
          </div>
        </div>
      )}

      {!error && !emptyContent && (!ready || !showBook) && (
        <div className="book-loading">
          <div className="book-loading-spinner" />
          <span className="text-xs opacity-50">
            {isLoading
              ? '正在解析 EPUB...'
              : !ready
              ? '正在排版...'
              : '正在恢复阅读进度...'}
          </span>
        </div>
      )}

      {ready && (
        <style dangerouslySetInnerHTML={{ __html: `
          .epub-page-content * {
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          .epub-page-content img {
            max-width: 100% !important;
            height: auto !important;
            object-fit: contain !important;
          }
          .epub-page-content a {
            color: inherit !important;
            text-decoration: underline;
          }
          .epub-page-content h1, .epub-page-content h2, .epub-page-content h3 {
            margin-top: 0.5em;
            margin-bottom: 0.3em;
          }
          .epub-page-content p {
            margin: 0.5em 0;
          }
          ${epubStyles}
        ` }} />
      )}

      {ready && pagination.totalPages > 0 && (
        <div
          className="book-frame"
          style={{
            position: 'relative',
            opacity: showBook ? 1 : 0,
            transition: 'opacity 0.3s ease-in',
          }}
        >
          {!isMobile && <div className="book-shadow" />}
          {!isMobile && <div className="page-stack-left" />}
          {!isMobile && <div className="page-stack-right" />}

          <HTMLFlipBook
            ref={flipBookRef}
            className="book-flipbook"
            width={pageDimensions.pageW}
            height={pageDimensions.pageH}
            size="fixed"
            minWidth={200}
            maxWidth={600}
            minHeight={300}
            maxHeight={900}
            showCover={false}
            mobileScrollSupport={false}
            useMouseEvents={true}
            usePortrait={isMobile}
            flippingTime={isMobile ? 500 : 600}
            drawShadow={!isMobile}
            maxShadowOpacity={isMobile ? 0.15 : 0.25}
            showPageCorners={!isMobile}
            disableFlipByClick={false}
            clickEventForward={true}
            swipeDistance={isMobile ? 20 : 30}
            startPage={startPage}
            startZIndex={2}
            autoSize={false}
            onFlip={handleFlip}
            onChangeState={handleChangeState}
            style={{}}
          >
            {pages.map((p) => {
              // 懒渲染：靠近当前页或起始页的页面才注入真实 HTML
              // 需要同时考虑 startPage，确保初始显示的页面（恢复进度时）有内容
              const isNear = Math.abs(p.pageIndex - currentPage) <= LAZY_WINDOW
                || Math.abs(p.pageIndex - startPage) <= LAZY_WINDOW;
              return (
                <BookPage
                  key={p.pageIndex}
                  pageIndex={p.pageIndex}
                  chapterHtml={isNear ? (chapters[p.chapterIndex]?.html || '') : ''}
                  pageInChapter={p.pageInChapter}
                  pageWidth={contentWidth}
                  pageHeight={contentHeight}
                  pageNumber={p.pageIndex + 1}
                  totalPages={pagination.totalPages}
                  fontSize={fontSize}
                  lineHeight={lineHeightVal}
                  fontFamily={fontFamily}
                  theme={theme}
                  padding={pagePadding}
                />
              );
            })}
          </HTMLFlipBook>

          {!isMobile && (
            <div className="book-spine" />
          )}
        </div>
      )}
    </div>
  );
}
