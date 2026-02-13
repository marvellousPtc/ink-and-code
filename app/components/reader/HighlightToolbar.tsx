'use client';

import { useCallback } from 'react';

const COLORS = [
  { key: 'yellow', cls: 'c-yellow' },
  { key: 'green', cls: 'c-green' },
  { key: 'blue', cls: 'c-blue' },
  { key: 'pink', cls: 'c-pink' },
  { key: 'purple', cls: 'c-purple' },
] as const;

interface HighlightToolbarProps {
  /** 工具栏位置（相对于阅读器容器） */
  position: { x: number; y: number };
  /** 用户点击颜色 → 创建高亮 */
  onHighlight: (color: string) => void;
  /** 用户点击笔记按钮 → 创建高亮 + 打开笔记弹窗 */
  onNote: () => void;
  /** 复制选中文字 */
  onCopy: () => void;
  /** 关闭工具栏 */
  onClose: () => void;
}

export default function HighlightToolbar({
  position, onHighlight, onNote, onCopy, onClose,
}: HighlightToolbarProps) {
  const handleColor = useCallback((color: string) => {
    onHighlight(color);
    onClose();
  }, [onHighlight, onClose]);

  const handleCopy = useCallback(() => {
    onCopy();
    onClose();
  }, [onCopy, onClose]);

  const handleNote = useCallback(() => {
    onNote();
    onClose();
  }, [onNote, onClose]);

  return (
    <div
      className="hl-toolbar"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%) translateY(-10px)',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* 颜色按钮 */}
      {COLORS.map(c => (
        <button
          key={c.key}
          className={`hl-toolbar-color ${c.cls}`}
          title={c.key}
          onClick={() => handleColor(c.key)}
        />
      ))}

      <div className="hl-toolbar-sep" />

      {/* 笔记按钮 */}
      <button className="hl-toolbar-btn" title="添加笔记" onClick={handleNote}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>

      {/* 复制按钮 */}
      <button className="hl-toolbar-btn" title="复制" onClick={handleCopy}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
    </div>
  );
}
