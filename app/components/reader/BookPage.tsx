import React, { useMemo } from 'react';

interface BookPageProps {
  pageIndex: number;
  chapterHtml: string;        // 空字符串 = 远离当前页，渲染空白占位
  pageInChapter: number;
  pageWidth: number;
  pageHeight: number;
  pageNumber: number;
  totalPages: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  theme: string;
  padding: number;            // 页面内边距（移动端更小）
}

const THEME_MAP: Record<string, { pageNumColor: string }> = {
  dark:  { pageNumColor: 'rgba(200,192,184,0.4)' },
  sepia: { pageNumColor: 'rgba(91,70,54,0.35)' },
  light: { pageNumColor: 'rgba(0,0,0,0.3)' },
};

const FONT_MAP: Record<string, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  'sans-serif': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"SF Mono", "Fira Code", monospace',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
};

/**
 * 翻页书的单页组件
 *
 * 性能优化：
 * - currentPage 不再作为 prop 传入，避免翻页时 2000+ 个组件的 memo 对比开销
 * - 懒渲染由父组件控制：chapterHtml 为空 → 渲染空白占位
 * - backgroundColor / color / overflow 通过 CSS class 设置（page-flip 不会覆盖）
 */
const BookPage = React.forwardRef<HTMLDivElement, BookPageProps>(
  (
    {
      chapterHtml,
      pageInChapter,
      pageWidth,
      pageHeight,
      pageNumber,
      totalPages,
      fontSize,
      lineHeight,
      fontFamily,
      theme,
      padding,
    },
    ref,
  ) => {
    const themeColors = THEME_MAP[theme] || THEME_MAP.light;
    const fontFamilyCss = FONT_MAP[fontFamily] || FONT_MAP.system;

    const translateX = pageInChapter * pageWidth;

    // 内容样式：极宽容器 + CSS 多列 + translateX 定位
    const contentStyle = useMemo(() => ({
      width: `${pageWidth * 200}px`,
      columnWidth: `${pageWidth}px`,
      columnGap: '0px',
      columnFill: 'auto' as const,
      height: `${pageHeight}px`,
      fontSize: `${fontSize}px`,
      lineHeight,
      fontFamily: fontFamilyCss,
      wordWrap: 'break-word' as const,
      overflowWrap: 'break-word' as const,
      transform: translateX > 0 ? `translateX(-${translateX}px)` : undefined,
    }), [pageWidth, pageHeight, fontSize, lineHeight, fontFamilyCss, translateX]);

    return (
      <div
        ref={ref}
        className="book-page"
        style={{
          width: pageWidth + padding * 2,
          height: pageHeight + padding * 2 + 30,
          position: 'relative',
        }}
      >
        {chapterHtml ? (
          <div
            style={{
              position: 'absolute',
              top: padding,
              left: padding,
              width: pageWidth,
              height: pageHeight,
              overflow: 'hidden',
            }}
          >
            <div
              className="epub-page-content"
              style={contentStyle}
              dangerouslySetInnerHTML={{ __html: chapterHtml }}
            />
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              top: padding,
              left: padding,
              width: pageWidth,
              height: pageHeight,
            }}
          />
        )}

        {/* 页码 */}
        <div
          style={{
            position: 'absolute',
            bottom: padding > 24 ? 12 : 6,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: padding > 24 ? '11px' : '10px',
            fontFamily: 'Georgia, "Times New Roman", serif',
            color: themeColors.pageNumColor,
            letterSpacing: '0.5px',
            userSelect: 'none',
          }}
        >
          {pageNumber} / {totalPages}
        </div>
      </div>
    );
  },
);

BookPage.displayName = 'BookPage';

/**
 * React.memo 自定义比较：
 * 不再比较 currentPage（已从 props 中移除），大幅减少翻页时的比较开销。
 * 父组件通过 chapterHtml 是否为空来控制懒渲染，这里只需比较 chapterHtml 引用。
 */
export default React.memo(BookPage, (prev, next) => {
  // 快速路径：chapterHtml 引用不变 → 跳过内容渲染比较
  if (prev.chapterHtml !== next.chapterHtml) return false;
  if (prev.pageIndex !== next.pageIndex) return false;
  if (prev.pageWidth !== next.pageWidth) return false;
  if (prev.pageHeight !== next.pageHeight) return false;
  if (prev.fontSize !== next.fontSize) return false;
  if (prev.lineHeight !== next.lineHeight) return false;
  if (prev.fontFamily !== next.fontFamily) return false;
  if (prev.theme !== next.theme) return false;
  if (prev.totalPages !== next.totalPages) return false;
  if (prev.pageInChapter !== next.pageInChapter) return false;
  if (prev.padding !== next.padding) return false;
  return true;
});
