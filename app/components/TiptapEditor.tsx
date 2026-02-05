/*
 * :file description: 
 * :name: /ink-and-code/app/components/TiptapEditor.tsx
 * :author: PTC
 * :copyright: (c) 2026, Tungee
 * :date created: 2026-01-30 14:12:35
 * :last editor: PTC
 * :date last edited: 2026-02-05 10:42:37
 */
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { ResizableImage } from './ResizableImageExtension';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  CodeSquare,
  Link as LinkIcon,
  Image as ImageIcon,
  Minus,
  Undo,
  Redo,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// URL 输入弹窗组件
interface UrlDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (url: string) => void;
  title: string;
  placeholder?: string;
  initialValue?: string;
}

function UrlDialog({ isOpen, onClose, onConfirm, title, placeholder = '请输入 URL', initialValue = '' }: UrlDialogProps) {
  const [url, setUrl] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirm(url);
    setUrl('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* 弹窗内容 */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-background border border-border rounded-xl shadow-2xl animate-in zoom-in-95 fade-in duration-200">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* 输入区域 */}
        <div className="px-5 py-4">
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full px-4 py-3 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-muted-foreground"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            提示：输入完整 URL（如 https://example.com）
          </p>
        </div>
        
        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-background border border-border rounded-lg transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

const lowlight = createLowlight(common);

interface TiptapEditorProps {
  content: string;
  onChange: (json: string) => void;
  placeholder?: string;
  headerContent?: React.ReactNode;
}

// 工具栏按钮
function ToolbarToggle({
  pressed,
  onPressedChange,
  disabled,
  tooltip,
  children,
}: {
  pressed?: boolean;
  onPressedChange: () => void;
  disabled?: boolean;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={pressed}
          onPressedChange={onPressedChange}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
        >
          {children}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={5}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export default function TiptapEditor({
  content,
  onChange,
  placeholder = '开始写作...',
  headerContent,
}: TiptapEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 弹窗状态
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [imageUrlDialogOpen, setImageUrlDialogOpen] = useState(false);
  const [currentLinkUrl, setCurrentLinkUrl] = useState('');

  const parseContent = (str: string) => {
    if (!str || str === '') return undefined;
    try {
      return JSON.parse(str);
    } catch {
      return undefined;
    }
  };

  // 上传图片到服务器
  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      setUploadError(null);
      
      const res = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.code === 200 && data.data?.url) {
        return data.data.url;
      } else {
        setUploadError(data.message || '上传失败');
        return null;
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadError('上传失败，请重试');
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  // 处理文件上传（点击按钮触发）
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const url = await uploadImage(file);
        if (url && editor) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      }
    }

    // 清空 input 以便再次选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      ResizableImage.configure({
        inline: false,
        allowBase64: true,
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'javascript',
      }),
    ],
    content: parseContent(content),
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none prose prose-lg dark:prose-invert max-w-none leading-relaxed',
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter') {
          const { state } = view;
          const { $from } = state.selection;
          const textBefore = $from.parent.textContent;
          const match = textBefore.match(/^```(\w*)$/);
          if (match) {
            const language = match[1] || 'javascript';
            view.dispatch(
              state.tr
                .delete($from.start(), $from.pos)
                .setBlockType(
                  $from.start(),
                  $from.start(),
                  state.schema.nodes.codeBlock,
                  { language }
                )
            );
            return true;
          }
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && content) {
      const currentContent = JSON.stringify(editor.getJSON());
      if (currentContent !== content) {
        const parsed = parseContent(content);
        if (parsed) {
          // 使用 queueMicrotask 避免 flushSync 警告
          queueMicrotask(() => {
            editor.commands.setContent(parsed);
          });
        }
      }
    }
  }, [editor, content]);

  // 处理粘贴和拖拽图片
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) {
            uploadImage(file).then((url) => {
              if (url) {
                editor.chain().focus().setImage({ src: url }).run();
              }
            });
          }
          return;
        }
      }
    };

    const handleDrop = (event: DragEvent) => {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith('image/')
      );

      if (imageFiles.length === 0) return;

      event.preventDefault();

      imageFiles.forEach((file) => {
        uploadImage(file).then((url) => {
          if (url) {
            editor.chain().focus().setImage({ src: url }).run();
          }
        });
      });
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener('paste', handlePaste);
    editorElement.addEventListener('drop', handleDrop);

    return () => {
      editorElement.removeEventListener('paste', handlePaste);
      editorElement.removeEventListener('drop', handleDrop);
    };
  }, [editor, uploadImage]);

  // 格式化 URL，确保包含协议
  const formatUrl = (url: string): string => {
    if (!url) return url;
    url = url.trim();
    // 如果已经有协议，直接返回
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    // 如果是相对路径（以 / 开头），直接返回
    if (url.startsWith('/')) {
      return url;
    }
    // 如果是邮箱链接
    if (url.includes('@') && !url.includes('/')) {
      return `mailto:${url}`;
    }
    // 默认添加 https://
    return `https://${url}`;
  };

  // 打开链接弹窗
  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href || '';
    setCurrentLinkUrl(previousUrl);
    setLinkDialogOpen(true);
  }, [editor]);

  // 处理链接确认
  const handleLinkConfirm = useCallback((url: string) => {
    if (!editor) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const formattedUrl = formatUrl(url);
    editor.chain().focus().extendMarkRange('link').setLink({ href: formattedUrl }).run();
  }, [editor]);

  // 打开文件选择对话框
  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 打开图片 URL 弹窗
  const openImageUrlDialog = useCallback(() => {
    if (!editor) return;
    setImageUrlDialogOpen(true);
  }, [editor]);

  // 处理图片 URL 确认
  const handleImageUrlConfirm = useCallback((url: string) => {
    if (!editor || !url) return;
    const formattedUrl = formatUrl(url);
    editor.chain().focus().setImage({ src: formattedUrl }).run();
  }, [editor]);

  // 处理行内代码切换
  const handleToggleCode = useCallback(() => {
    if (!editor) return;
    
    const { from, to } = editor.state.selection;
    
    // 如果没有选中文本，先选中当前单词
    if (from === to) {
      // 尝试选中当前单词
      const { $from } = editor.state.selection;
      const start = $from.start();
      const text = $from.parent.textContent;
      const posInNode = $from.pos - start;
      
      // 找到单词边界
      let wordStart = posInNode;
      let wordEnd = posInNode;
      
      while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) {
        wordStart--;
      }
      while (wordEnd < text.length && !/\s/.test(text[wordEnd])) {
        wordEnd++;
      }
      
      if (wordStart !== wordEnd) {
        // 选中单词并切换代码样式
        editor
          .chain()
          .focus()
          .setTextSelection({ from: start + wordStart, to: start + wordEnd })
          .toggleCode()
          .run();
        return;
      }
    }
    
    // 如果有选中文本，直接切换
    editor.chain().focus().toggleCode().run();
  }, [editor]);

  if (!editor) {
    return (
      <div className="h-[400px] bg-background border border-border rounded-lg animate-pulse" />
    );
  }

  return (
    <div className="group/editor flex flex-col min-h-[600px]">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      
      {/* 上传状态提示 */}
      {(uploading || uploadError) && (
        <div className={`px-4 py-2 text-sm flex items-center gap-2 ${
          uploadError 
            ? 'bg-red-500/10 text-red-500 border-b border-red-500/20' 
            : 'bg-primary/10 text-primary border-b border-primary/20'
        }`}>
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>正在上传图片...</span>
            </>
          ) : uploadError ? (
            <>
              <span>{uploadError}</span>
              <button 
                onClick={() => setUploadError(null)}
                className="ml-auto text-xs underline"
              >
                关闭
              </button>
            </>
          ) : null}
        </div>
      )}
      
      {/* 悬浮工具栏 */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1 p-2 bg-background border-b border-card-border/60 shadow-sm transition-all duration-300 opacity-60 hover:opacity-100 group-focus-within/editor:opacity-100 group-focus-within/editor:shadow-md">
        {/* 文本格式 */}
        <div className="flex items-center gap-0.5 px-1">
          <ToolbarToggle
            pressed={editor.isActive('bold')}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
            tooltip="粗体 (⌘B)"
          >
            <Bold className="size-3.5" />
          </ToolbarToggle>
          <ToolbarToggle
            pressed={editor.isActive('italic')}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
            tooltip="斜体 (⌘I)"
          >
            <Italic className="size-3.5" />
          </ToolbarToggle>
          <ToolbarToggle
            pressed={editor.isActive('strike')}
            onPressedChange={() => editor.chain().focus().toggleStrike().run()}
            tooltip="删除线"
          >
            <Strikethrough className="size-3.5" />
          </ToolbarToggle>
          <ToolbarToggle
            pressed={editor.isActive('code')}
            onPressedChange={handleToggleCode}
            tooltip="行内代码"
          >
            <Code className="size-3.5" />
          </ToolbarToggle>
        </div>

        <div className="w-px h-4 bg-card-border/60 mx-1" />

        {/* 标题 */}
        <div className="flex items-center gap-0.5 px-1">
          <ToolbarToggle
            pressed={editor.isActive('heading', { level: 1 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            tooltip="一级标题"
          >
            <Heading1 className="size-3.5" />
          </ToolbarToggle>
          <ToolbarToggle
            pressed={editor.isActive('heading', { level: 2 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            tooltip="二级标题"
          >
            <Heading2 className="size-3.5" />
          </ToolbarToggle>
          <ToolbarToggle
            pressed={editor.isActive('heading', { level: 3 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            tooltip="三级标题"
          >
            <Heading3 className="size-3.5" />
          </ToolbarToggle>
        </div>

        <div className="w-px h-4 bg-card-border/60 mx-1" />

        {/* 列表和内容块 */}
        <div className="flex items-center gap-0.5 px-1">
          <ToolbarToggle
            pressed={editor.isActive('bulletList')}
            onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
            tooltip="无序列表"
          >
            <List className="size-3.5" />
          </ToolbarToggle>
          <ToolbarToggle
            pressed={editor.isActive('orderedList')}
            onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
            tooltip="有序列表"
          >
            <ListOrdered className="size-3.5" />
          </ToolbarToggle>
          <ToolbarToggle
            pressed={editor.isActive('blockquote')}
            onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
            tooltip="引用"
          >
            <Quote className="size-3.5" />
          </ToolbarToggle>
          <ToolbarToggle
            pressed={editor.isActive('codeBlock')}
            onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()}
            tooltip="代码块"
          >
            <CodeSquare className="size-3.5" />
          </ToolbarToggle>
        </div>

        <div className="w-px h-4 bg-card-border/60 mx-1" />

        {/* 媒体和链接 */}
        <div className="flex items-center gap-0.5 px-1">
          <ToolbarToggle
            pressed={editor.isActive('link')}
            onPressedChange={openLinkDialog}
            tooltip="插入链接"
          >
            <LinkIcon className="size-3.5" />
          </ToolbarToggle>
          <ToolbarToggle 
            onPressedChange={openFileDialog} 
            tooltip="上传图片"
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
          </ToolbarToggle>
          <ToolbarToggle onPressedChange={openImageUrlDialog} tooltip="图片 URL">
            <ImageIcon className="size-3.5" />
          </ToolbarToggle>
          <ToolbarToggle
            onPressedChange={() => editor.chain().focus().setHorizontalRule().run()}
            tooltip="分割线"
          >
            <Minus className="size-3.5" />
          </ToolbarToggle>
        </div>

        <div className="flex-1" />

        {/* 历史记录 */}
        <div className="flex items-center gap-0.5 px-1">
          <ToolbarToggle
            onPressedChange={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            tooltip="撤销 (⌘Z)"
          >
            <Undo className="size-3.5" />
          </ToolbarToggle>
          <ToolbarToggle
            onPressedChange={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            tooltip="重做 (⇧⌘Z)"
          >
            <Redo className="size-3.5" />
          </ToolbarToggle>
        </div>
      </div>

      {/* 内容区域（带 padding） */}
      <div className="flex-1 px-10 py-8">
        {/* 头部内容区（标题、摘要等） */}
        {headerContent && (
          <div className="mb-4">
            {headerContent}
          </div>
        )}

        {/* 编辑区容器 */}
        <div className="flex-1">
          <EditorContent editor={editor} className="tiptap-editor-content" />
        </div>
      </div>

      {/* 链接输入弹窗 */}
      <UrlDialog
        isOpen={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onConfirm={handleLinkConfirm}
        title="插入链接"
        placeholder="https://example.com"
        initialValue={currentLinkUrl}
      />

      {/* 图片 URL 输入弹窗 */}
      <UrlDialog
        isOpen={imageUrlDialogOpen}
        onClose={() => setImageUrlDialogOpen(false)}
        onConfirm={handleImageUrlConfirm}
        title="插入图片"
        placeholder="https://example.com/image.jpg"
      />
    </div>
  );
}
