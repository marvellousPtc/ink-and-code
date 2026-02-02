'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { useState, useCallback, useRef, useEffect } from 'react';

// 可调整大小的图片组件
function ResizableImageComponent({ node, updateAttributes, selected }: NodeViewProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { src, alt, title, width } = node.attrs;

  const handleMouseDown = useCallback((e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setStartX(e.clientX);
    setStartWidth(imageRef.current?.offsetWidth || width || 300);
  }, [width]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(100, startWidth + diff);
      updateAttributes({ width: newWidth });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, startX, startWidth, updateAttributes]);

  return (
    <NodeViewWrapper className="resizable-image-wrapper" data-drag-handle>
      <div
        ref={containerRef}
        className={`relative inline-block ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
        style={{ width: width ? `${width}px` : 'auto' }}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt || ''}
          title={title || ''}
          className="rounded-lg max-w-full h-auto block"
          style={{ width: '100%' }}
          draggable={false}
        />
        
        {/* 调整大小手柄 - 只在选中时显示 */}
        {selected && (
          <>
            {/* 右下角手柄 */}
            <div
              className="absolute bottom-0 right-0 w-4 h-4 bg-primary border-2 border-background rounded-sm cursor-se-resize transform translate-x-1/2 translate-y-1/2 hover:scale-110 transition-transform"
              onMouseDown={(e) => handleMouseDown(e, 'se')}
            />
            {/* 右侧手柄 */}
            <div
              className="absolute top-1/2 right-0 w-3 h-8 bg-primary/80 border-2 border-background rounded-sm cursor-e-resize transform translate-x-1/2 -translate-y-1/2 hover:scale-110 transition-transform"
              onMouseDown={(e) => handleMouseDown(e, 'e')}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// 自定义 Image 扩展
export const ResizableImage = Node.create({
  name: 'image',

  addOptions() {
    return {
      inline: false,
      allowBase64: true,
      HTMLAttributes: {},
    };
  },

  inline() {
    return this.options.inline;
  },

  group() {
    return this.options.inline ? 'inline' : 'block';
  },

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: null,
      },
      height: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },

  addCommands() {
    return {
      setImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

export default ResizableImage;
