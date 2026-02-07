'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChapterData } from './use-epub-content';
import type { ReadingSettingsData } from './use-library';

export interface ChapterPageRange {
  chapterIndex: number;
  startPage: number;
  pageCount: number;
}

export interface PaginationResult {
  totalPages: number;
  chapterPageRanges: ChapterPageRange[];
  pageWidth: number;
  pageHeight: number;
  isReady: boolean;
}

/**
 * 利用 CSS 多列布局对章节内容进行分页测量
 *
 * 原理：
 * 1. 为每个章节创建一个隐藏的测量容器，设置 column-width 与页面宽度相同
 * 2. 容器高度固定为页面高度，多余的内容会自动溢出为新的列
 * 3. 通过 scrollWidth / columnWidth 计算该章节的页数
 */
export function useBookPagination(
  chapters: ChapterData[],
  styles: string,
  settings: ReadingSettingsData | null | undefined,
  containerWidth: number,
  containerHeight: number,
): PaginationResult {
  const [result, setResult] = useState<PaginationResult>({
    totalPages: 0,
    chapterPageRanges: [],
    pageWidth: 0,
    pageHeight: 0,
    isReady: false,
  });

  const measureRef = useRef<HTMLDivElement | null>(null);

  // 从设置中获取排版参数
  const fontSize = settings?.fontSize ?? 16;
  const lineHeight = settings?.lineHeight ?? 1.8;
  const fontFamily = settings?.fontFamily ?? 'system';

  const fontFamilyCss =
    fontFamily === 'serif' ? 'Georgia, "Times New Roman", serif' :
    fontFamily === 'sans-serif' ? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' :
    fontFamily === 'mono' ? '"SF Mono", "Fira Code", monospace' :
    '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

  // containerWidth / containerHeight 已经是内容区域尺寸（调用方已减去 padding）
  const pageContentWidth = Math.max(200, containerWidth);
  const pageContentHeight = Math.max(200, containerHeight);

  const paginate = useCallback(() => {
    // 没有内容时也要标记为就绪（避免无限加载）
    if (chapters.length === 0) {
      setResult({
        totalPages: 0,
        chapterPageRanges: [],
        pageWidth: pageContentWidth,
        pageHeight: pageContentHeight,
        isReady: true,
      });
      return;
    }

    if (pageContentWidth <= 0 || pageContentHeight <= 0) {
      return;
    }

    try {
      // 创建隐藏的测量容器
      let measureEl = measureRef.current;
      if (!measureEl) {
        measureEl = document.createElement('div');
        measureEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(measureEl);
        measureRef.current = measureEl;
      }

      // 基本样式：隐藏、不可见
      measureEl.style.cssText = `
        position: absolute;
        left: -99999px;
        top: 0;
        visibility: hidden;
        pointer-events: none;
        z-index: -1;
      `;

      const ranges: ChapterPageRange[] = [];
      let cumulativePages = 0;

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];

        // 为每个章节设置测量容器
        measureEl.innerHTML = `
          <style>
            .epub-measure-container * {
              max-width: 100% !important;
              box-sizing: border-box !important;
            }
            .epub-measure-container img {
              max-width: 100% !important;
              height: auto !important;
              object-fit: contain !important;
            }
            ${styles}
          </style>
          <div class="epub-measure-container" style="
            width: ${pageContentWidth}px;
            height: ${pageContentHeight}px;
            column-width: ${pageContentWidth}px;
            column-gap: 0px;
            column-fill: auto;
            overflow: hidden;
            font-size: ${fontSize}px;
            line-height: ${lineHeight};
            font-family: ${fontFamilyCss};
            word-wrap: break-word;
            overflow-wrap: break-word;
          ">${chapter.html}</div>
        `;

        const contentEl = measureEl.querySelector('.epub-measure-container') as HTMLElement;
        if (!contentEl) continue;

        // 测量页数：scrollWidth 除以 columnWidth
        // 减去 2px 容差，避免子像素渲染差异导致多出空白页
        const scrollW = contentEl.scrollWidth;
        const pageCount = Math.max(1, Math.ceil((scrollW - 2) / pageContentWidth));

        ranges.push({
          chapterIndex: i,
          startPage: cumulativePages,
          pageCount,
        });

        cumulativePages += pageCount;
      }

      // 清理测量容器内容
      measureEl.innerHTML = '';

      console.log(`[Pagination] 分页完成: ${cumulativePages} 页, ${ranges.length} 章节, 内容区: ${pageContentWidth}x${pageContentHeight}`);

      setResult({
        totalPages: cumulativePages,
        chapterPageRanges: ranges,
        pageWidth: pageContentWidth,
        pageHeight: pageContentHeight,
        isReady: true,
      });
    } catch (err) {
      console.error('[Pagination] 分页失败:', err);
      // 即使分页失败也要标记为就绪，避免无限加载
      setResult({
        totalPages: 0,
        chapterPageRanges: [],
        pageWidth: pageContentWidth,
        pageHeight: pageContentHeight,
        isReady: true,
      });
    }
  }, [chapters, styles, fontSize, lineHeight, fontFamilyCss, pageContentWidth, pageContentHeight]);

  // 当内容或设置变化时重新分页（防抖 150ms，避免设置拖滑块时连续触发）
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      paginate();
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [paginate]);

  // 清理测量容器
  useEffect(() => {
    return () => {
      if (measureRef.current) {
        document.body.removeChild(measureRef.current);
        measureRef.current = null;
      }
    };
  }, []);

  return result;
}

/**
 * 根据全局页码获取所在章节及章内页码
 */
export function getChapterForPage(
  page: number,
  ranges: ChapterPageRange[],
): { chapterIndex: number; pageInChapter: number } | null {
  for (const range of ranges) {
    if (page >= range.startPage && page < range.startPage + range.pageCount) {
      return {
        chapterIndex: range.chapterIndex,
        pageInChapter: page - range.startPage,
      };
    }
  }
  return null;
}
