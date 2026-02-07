'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import type { ReadingSettingsData } from '@/lib/hooks/use-library';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

// 配置 PDF.js worker（使用本地文件，避免 CDN 访问问题）
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PdfReaderViewProps {
  url: string;
  bookId: string; // 用于代理 API
  initialPage?: number;
  settings?: ReadingSettingsData | null;
  onProgressUpdate?: (percentage: number, location?: string) => void;
}

export default function PdfReaderView({
  bookId,
  initialPage,
  settings,
  onProgressUpdate,
}: PdfReaderViewProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(initialPage || 1);
  const [isLoading, setIsLoading] = useState(true);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 通过代理 API 加载 PDF 数据
  useEffect(() => {
    async function loadPdf() {
      try {
        setIsLoading(true);
        setLoadError(null);
        const res = await fetch(`/api/library/file?id=${bookId}`);
        if (!res.ok) throw new Error(`加载失败: ${res.status}`);
        const data = await res.arrayBuffer();
        setPdfData(data);
      } catch (err) {
        console.error('Failed to load PDF:', err);
        setLoadError(err instanceof Error ? err.message : '加载失败');
        setIsLoading(false);
      }
    }
    loadPdf();
  }, [bookId]);

  const onDocumentLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    setIsLoading(false);
    if (initialPage && initialPage <= total) {
      setPageNumber(initialPage);
    }
  }, [initialPage]);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF Document load error:', error);
    setLoadError(error.message || 'PDF 文档解析失败');
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (numPages > 0) {
      const pct = Math.round((pageNumber / numPages) * 100);
      onProgressUpdate?.(pct, String(pageNumber));
    }
  }, [pageNumber, numPages, onProgressUpdate]);

  // 键盘翻页
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setPageNumber(prev => Math.max(1, prev - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setPageNumber(prev => Math.min(numPages, prev + 1));
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [numPages]);

  // 触摸滑动翻页
  useEffect(() => {
    if (!numPages) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
      touchStartTime = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      const dt = Date.now() - touchStartTime;

      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 500) {
        if (dx > 0) {
          setPageNumber(prev => Math.max(1, prev - 1));
        } else {
          setPageNumber(prev => Math.min(numPages, prev + 1));
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [numPages]);

  const pageWidth = settings?.pageWidth || 800;
  const pdfFile = useMemo(() => pdfData ? { data: pdfData } : null, [pdfData]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm opacity-60 mb-2">PDF 加载失败</p>
          <p className="text-xs opacity-40">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
      {isLoading && (
        <div className="flex items-center gap-2 py-8">
          <Loader2 className="w-5 h-5 animate-spin opacity-50" />
          <span className="text-sm opacity-50">正在加载 PDF...</span>
        </div>
      )}

      {pdfFile && (
        <Document
          file={pdfFile}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={null}
          className="py-4"
        >
          <Page
            pageNumber={pageNumber}
            width={Math.min(pageWidth, typeof window !== 'undefined' ? window.innerWidth - 40 : 800)}
            className="shadow-lg"
          />
        </Document>
      )}

      {/* 页码控制 */}
      {numPages > 0 && (
        <div className="sticky bottom-0 flex items-center justify-center gap-4 py-3 px-6 bg-inherit">
          <button
            onClick={(e) => { e.stopPropagation(); setPageNumber(prev => Math.max(1, prev - 1)); }}
            disabled={pageNumber <= 1}
            className="p-2 rounded-lg hover:bg-black/5 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold tabular-nums opacity-60">
            {pageNumber} / {numPages}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setPageNumber(prev => Math.min(numPages, prev + 1)); }}
            disabled={pageNumber >= numPages}
            className="p-2 rounded-lg hover:bg-black/5 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
