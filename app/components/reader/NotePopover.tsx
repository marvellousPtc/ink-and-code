'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

const COLORS = [
  { key: 'yellow', cls: 'c-yellow' },
  { key: 'green', cls: 'c-green' },
  { key: 'blue', cls: 'c-blue' },
  { key: 'pink', cls: 'c-pink' },
  { key: 'purple', cls: 'c-purple' },
] as const;

interface NotePopoverProps {
  /** 弹窗位置（相对于阅读器容器） */
  position: { x: number; y: number };
  /** 高亮 ID */
  highlightId: string;
  /** 高亮文字 */
  text: string;
  /** 当前颜色 */
  color: string;
  /** 当前笔记 */
  note: string | null;
  /** 更新高亮（颜色/笔记） */
  onUpdate: (id: string, data: { color?: string; note?: string }) => void;
  /** 删除高亮 */
  onDelete: (id: string) => void;
  /** 关闭弹窗 */
  onClose: () => void;
}

export default function NotePopover({
  position, highlightId, text, color, note,
  onUpdate, onDelete, onClose,
}: NotePopoverProps) {
  const [noteText, setNoteText] = useState(note ?? '');
  const [currentColor, setCurrentColor] = useState(color);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 弹窗出现时聚焦 textarea
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  const handleSave = useCallback(() => {
    const updates: { color?: string; note?: string } = {};
    if (currentColor !== color) updates.color = currentColor;
    if (noteText !== (note ?? '')) updates.note = noteText;
    if (Object.keys(updates).length > 0) {
      onUpdate(highlightId, updates);
    }
    onClose();
  }, [highlightId, currentColor, color, noteText, note, onUpdate, onClose]);

  const handleDelete = useCallback(() => {
    onDelete(highlightId);
    onClose();
  }, [highlightId, onDelete, onClose]);

  const handleColorChange = useCallback((c: string) => {
    setCurrentColor(c);
    // 立即更新颜色
    onUpdate(highlightId, { color: c });
  }, [highlightId, onUpdate]);

  // 按 Ctrl/Cmd+Enter 保存
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [handleSave, onClose]);

  return (
    <div
      className="hl-popover"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%) translateY(-10px)',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* 高亮文字预览 */}
      <div className="hl-popover-text" style={{ borderLeftColor: getColorHex(currentColor) }}>
        {text.length > 120 ? text.slice(0, 120) + '...' : text}
      </div>

      {/* 笔记编辑区 */}
      <textarea
        ref={textareaRef}
        className="hl-popover-note"
        placeholder="添加笔记..."
        value={noteText}
        onChange={e => setNoteText(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      {/* 底部：颜色 + 操作按钮 */}
      <div className="hl-popover-footer">
        <div className="hl-popover-colors">
          {COLORS.map(c => (
            <button
              key={c.key}
              className={`hl-toolbar-color ${c.cls}`}
              style={{
                width: 18,
                height: 18,
                border: c.key === currentColor ? '2px solid currentColor' : '2px solid transparent',
              }}
              onClick={() => handleColorChange(c.key)}
            />
          ))}
        </div>
        <div className="hl-popover-actions">
          <button className="hl-popover-delete" onClick={handleDelete}>删除</button>
          <button className="hl-popover-save" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}

function getColorHex(color: string): string {
  switch (color) {
    case 'yellow': return '#ffd84d';
    case 'green': return '#6cc96c';
    case 'blue': return '#5ca8ff';
    case 'pink': return '#ff7fa0';
    case 'purple': return '#a47aff';
    default: return '#ffd84d';
  }
}
