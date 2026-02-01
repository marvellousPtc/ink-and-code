'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from './ThemeProvider';

export default function Giscus() {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!ref.current || ref.current.hasChildNodes()) return;

    const scriptElement = document.createElement('script');
    scriptElement.src = 'https://giscus.app/client.js';
    scriptElement.async = true;
    scriptElement.crossOrigin = 'anonymous';

    // Giscus 配置
    scriptElement.setAttribute('data-repo', 'marvellousPtc/ink-and-code');
    scriptElement.setAttribute('data-repo-id', 'R_kgDORDBBDw');
    scriptElement.setAttribute('data-category', 'Announcements');
    scriptElement.setAttribute('data-category-id', 'DIC_kwDORDBBD84C1uOW');
    scriptElement.setAttribute('data-mapping', 'pathname');
    scriptElement.setAttribute('data-strict', '0');
    scriptElement.setAttribute('data-reactions-enabled', '1');
    scriptElement.setAttribute('data-emit-metadata', '0');
    scriptElement.setAttribute('data-input-position', 'bottom');
    scriptElement.setAttribute('data-theme', resolvedTheme === 'dark' ? 'dark' : 'light');
    scriptElement.setAttribute('data-lang', 'zh-CN');

    ref.current.appendChild(scriptElement);
  }, []);

  // 主题切换时更新 Giscus 主题
  useEffect(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe.giscus-frame');
    if (iframe) {
      iframe.contentWindow?.postMessage(
        {
          giscus: {
            setConfig: {
              theme: resolvedTheme === 'dark' ? 'dark' : 'light',
            },
          },
        },
        'https://giscus.app'
      );
    }
  }, [resolvedTheme]);

  return (
    <section className="mt-16 pt-8 border-t border-card-border">
      <h2 className="text-lg font-bold mb-8 flex items-center gap-3">
        <span className="text-2xl">💬</span>
        评论
      </h2>
      <div ref={ref} />
    </section>
  );
}
