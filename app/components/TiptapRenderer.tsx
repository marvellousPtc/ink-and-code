'use client';

import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const lowlight = createLowlight(common);

interface TiptapRendererProps {
  content: string; // JSON string or Markdown
}

export default function TiptapRenderer({ content }: TiptapRendererProps) {
  const { isJson, html } = useMemo(() => {
    if (!content) return { isJson: false, html: '' };

    try {
      // 尝试解析为 JSON（Tiptap 格式）
      const json = JSON.parse(content);
      const generatedHtml = generateHTML(json, [
        StarterKit.configure({
          codeBlock: false,
        }),
        Link.configure({
          HTMLAttributes: {
            class: 'text-primary underline hover:no-underline',
          },
        }),
        Image.configure({
          HTMLAttributes: {
            class: 'max-w-full rounded-lg my-4',
          },
        }),
        CodeBlockLowlight.configure({
          lowlight,
        }),
      ]);
      return { isJson: true, html: generatedHtml };
    } catch {
      // 不是 JSON，返回原始内容用于 Markdown 渲染
      return { isJson: false, html: '' };
    }
  }, [content]);

  // 如果是 JSON 格式，使用 HTML 渲染
  if (isJson) {
    return (
      <div
        className="tiptap-content overflow-hidden"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // 如果是 Markdown 格式，使用 ReactMarkdown 渲染
  return (
    <div className="tiptap-content overflow-hidden">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
