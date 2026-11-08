import type { Metadata } from "next";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { ThemeProvider } from "./components/ThemeProvider";
import { SWRProvider } from "./components/SWRProvider";
import { ConfirmProvider } from "./components/ConfirmDialog";
import AuthProvider from "./components/AuthProvider";
import ChatAssistant from "./components/ChatAssistant";
import { AI_CHAT_ENABLED } from "@/lib/features";

export const metadata: Metadata = {
  title: "Ink & Code | 用代码书写思想",
  description: "一个关于编程、技术和创意的个人博客",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 内联脚本，在 React 水合之前立即设置主题和自定义颜色，避免闪烁
  const themeScript = `
    (function() {
      try {
        var theme = localStorage.getItem('theme');
        var resolved = theme;
        if (theme === 'light' || theme === 'dark') {
          document.documentElement.setAttribute('data-theme', theme);
        } else {
          resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          document.documentElement.setAttribute('data-theme', resolved);
        }

        var colorsStr = localStorage.getItem('theme-colors');
        if (colorsStr) {
          var allColors = JSON.parse(colorsStr);
          var colors = allColors[resolved];
          if (colors) {
            var root = document.documentElement;
            var keys = Object.keys(colors);
            for (var i = 0; i < keys.length; i++) {
              root.style.setProperty(keys[i], colors[keys[i]]);
            }
            var p = colors['--primary'];
            if (p && /^#[a-fA-F0-9]{6}$/.test(p)) {
              var r = parseInt(p.slice(1,3),16), g = parseInt(p.slice(3,5),16), b = parseInt(p.slice(5,7),16);
              root.style.setProperty('--primary-glow', 'rgba('+r+','+g+','+b+',0.15)');
              root.style.setProperty('--ring', p);
              root.style.setProperty('--primary-foreground', (0.299*r+0.587*g+0.114*b)/255>0.5?'#030303':'#ffffff');
            }
            var bg = colors['--background'];
            if (bg && /^#[a-fA-F0-9]{6}$/.test(bg)) {
              var rb=parseInt(bg.slice(1,3),16),gb=parseInt(bg.slice(3,5),16),bb=parseInt(bg.slice(5,7),16);
              root.style.setProperty('--glass-bg','rgba('+rb+','+gb+','+bb+',0.85)');
              root.style.setProperty('--glass-border',(0.299*rb+0.587*gb+0.114*bb)/255>0.5?'rgba(0,0,0,0.05)':'rgba(255,255,255,0.06)');
            }
            if(colors['--foreground']){root.style.setProperty('--card-foreground',colors['--foreground']);root.style.setProperty('--popover-foreground',colors['--foreground'])}
            if(colors['--card']){root.style.setProperty('--popover',colors['--card'])}
            if(colors['--card-border']){root.style.setProperty('--border',colors['--card-border']);root.style.setProperty('--input',colors['--card-border']);root.style.setProperty('--accent',colors['--card-border']);root.style.setProperty('--secondary',colors['--card-border'])}
            if(colors['--muted']){root.style.setProperty('--muted-foreground',colors['--muted'])}
          }
        }
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    })();
  `;

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased flex flex-col min-h-screen">
        <AuthProvider>
          <SWRProvider>
            <ThemeProvider>
              <ConfirmProvider>
                <Header />
                <main className="grow">{children}</main>
                <Footer />
                {AI_CHAT_ENABLED && <ChatAssistant />}
              </ConfirmProvider>
            </ThemeProvider>
          </SWRProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
