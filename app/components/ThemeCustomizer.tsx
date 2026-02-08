/*
 * :file description: 
 * :name: /ink-and-code/app/components/ThemeCustomizer.tsx
 * :author: PTC
 * :copyright: (c) 2026, Tungee
 * :date created: 2026-02-07 10:50:07
 * :last editor: PTC
 * :date last edited: 2026-02-08 02:51:35
 */
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Palette, RotateCcw, Sun, Moon, Monitor, ChevronDown, Check } from 'lucide-react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { useTheme, type ThemeColors } from './ThemeProvider';

// ==================== 预设主题 ====================

const PRESETS: Array<{
  id: string;
  name: string;
  icon: string;
  colors: ThemeColors;
}> = [
  {
    id: 'default',
    name: '经典',
    icon: '✨',
    colors: { dark: {}, light: {} },
  },
  {
    id: 'ocean',
    name: '深海',
    icon: '🌊',
    colors: {
      dark: {
        '--background': '#0a0f1a',
        '--foreground': '#e4eaf4',
        '--card': '#111b2e',
        '--card-border': '#1c2e4d',
        '--primary': '#5b9cf5',
        '--muted': '#8899b5',
      },
      light: {
        '--background': '#f4f8fc',
        '--foreground': '#1a2a3a',
        '--card': '#ffffff',
        '--card-border': '#d0dff0',
        '--primary': '#2563eb',
        '--muted': '#6882a0',
      },
    },
  },
  {
    id: 'forest',
    name: '森林',
    icon: '🌿',
    colors: {
      dark: {
        '--background': '#080f0b',
        '--foreground': '#e0f0e4',
        '--card': '#0f1e14',
        '--card-border': '#1c3524',
        '--primary': '#4ade80',
        '--muted': '#82a590',
      },
      light: {
        '--background': '#f4faf5',
        '--foreground': '#1a2e1e',
        '--card': '#ffffff',
        '--card-border': '#c8e0d0',
        '--primary': '#16a34a',
        '--muted': '#5c8a6a',
      },
    },
  },
  {
    id: 'violet',
    name: '紫罗兰',
    icon: '💜',
    colors: {
      dark: {
        '--background': '#0c0a14',
        '--foreground': '#e8e2f5',
        '--card': '#15102a',
        '--card-border': '#271e48',
        '--primary': '#a78bfa',
        '--muted': '#9088a8',
      },
      light: {
        '--background': '#f8f5ff',
        '--foreground': '#2a1a3e',
        '--card': '#ffffff',
        '--card-border': '#dcd0f0',
        '--primary': '#7c3aed',
        '--muted': '#7a6b90',
      },
    },
  },
  {
    id: 'rose',
    name: '玫瑰',
    icon: '🌹',
    colors: {
      dark: {
        '--background': '#120a0c',
        '--foreground': '#f5e2e6',
        '--card': '#201218',
        '--card-border': '#3d1e28',
        '--primary': '#f472b6',
        '--muted': '#a88890',
      },
      light: {
        '--background': '#fff5f7',
        '--foreground': '#3a1a22',
        '--card': '#ffffff',
        '--card-border': '#f0d0da',
        '--primary': '#e11d48',
        '--muted': '#906b75',
      },
    },
  },
  {
    id: 'sunset',
    name: '日落',
    icon: '🌅',
    colors: {
      dark: {
        '--background': '#120e0a',
        '--foreground': '#f5ece0',
        '--card': '#201a12',
        '--card-border': '#3d2a1c',
        '--primary': '#fb923c',
        '--muted': '#a89480',
      },
      light: {
        '--background': '#fff8f0',
        '--foreground': '#3a2218',
        '--card': '#ffffff',
        '--card-border': '#f0dcc8',
        '--primary': '#ea580c',
        '--muted': '#907560',
      },
    },
  },
  {
    id: 'minimal',
    name: '极简',
    icon: '⬜',
    colors: {
      dark: {
        '--background': '#111111',
        '--foreground': '#eeeeee',
        '--card': '#1a1a1a',
        '--card-border': '#2c2c2c',
        '--primary': '#999999',
        '--muted': '#888888',
      },
      light: {
        '--background': '#ffffff',
        '--foreground': '#111111',
        '--card': '#f8f8f8',
        '--card-border': '#e0e0e0',
        '--primary': '#555555',
        '--muted': '#888888',
      },
    },
  },
  {
    id: 'cyber',
    name: '赛博',
    icon: '⚡',
    colors: {
      dark: {
        '--background': '#080812',
        '--foreground': '#e0f0ff',
        '--card': '#0e0e22',
        '--card-border': '#1a1a40',
        '--primary': '#00ffc8',
        '--muted': '#7888bb',
      },
      light: {
        '--background': '#f0f2ff',
        '--foreground': '#1a1a2e',
        '--card': '#ffffff',
        '--card-border': '#d0d5ee',
        '--primary': '#00b890',
        '--muted': '#6b6b90',
      },
    },
  },
];

// ==================== 可自定义颜色配置 ====================

const COLOR_CONFIG = [
  { key: '--primary', label: '主题色', desc: '按钮、链接、强调色' },
  { key: '--background', label: '背景色', desc: '页面背景' },
  { key: '--foreground', label: '文字色', desc: '标题和正文颜色' },
  { key: '--card', label: '卡片色', desc: '卡片和面板背景' },
  { key: '--card-border', label: '边框色', desc: '分割线和边框' },
  { key: '--muted', label: '次要文字', desc: '辅助信息文字' },
];

// ==================== 组件 ====================

export default function ThemeCustomizer() {
  const {
    theme, resolvedTheme, setTheme, mounted,
    preset, colorOverrides, applyPreset, setCustomColor, resetColors,
    isCustomizerOpen, setCustomizerOpen,
  } = useTheme();

  const [expandedColor, setExpandedColor] = useState<string | null>(null);

  // ESC 关闭面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCustomizerOpen(false);
    };
    if (isCustomizerOpen) {
      document.addEventListener('keydown', handler);
    }
    return () => document.removeEventListener('keydown', handler);
  }, [isCustomizerOpen, setCustomizerOpen]);

  // 打开面板时禁止 body 滚动
  useEffect(() => {
    if (isCustomizerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isCustomizerOpen]);

  if (!mounted) {
    return <div className="w-10 h-10 rounded-full border border-card-border bg-card" />;
  }

  const currentColors = colorOverrides[resolvedTheme] || {};

  // 获取当前生效的颜色值（自定义 > CSS 默认）
  const getEffectiveColor = (key: string): string => {
    if (currentColors[key]) return currentColors[key];
    return getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  };

  const handlePresetSelect = (p: typeof PRESETS[number]) => {
    applyPreset(p.id, p.colors);
    setExpandedColor(null);
  };

  const handleColorChange = (key: string, value: string) => {
    setCustomColor(key, value);
  };

  // 遮罩层 + 面板通过 portal 渲染到 body，避免被 header 的 backdrop-filter 创建的层叠上下文限制
  const panelContent = (
    <>
      {/* 遮罩层 */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[199] transition-opacity duration-300 ${
          isCustomizerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setCustomizerOpen(false)}
      />

      {/* 定制面板 */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-full sm:w-[380px] bg-background border-l border-card-border z-[200] transform transition-transform duration-300 ease-out overflow-y-auto scrollbar-hide ${
          isCustomizerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* 面板头部 */}
        <div className="sticky top-0 bg-background/90 backdrop-blur-xl z-10 px-6 py-5 border-b border-card-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Palette className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">主题定制</h3>
                <p className="text-[10px] text-muted mt-0.5">打造你的专属风格</p>
              </div>
            </div>
            <button
              onClick={() => setCustomizerOpen(false)}
              className="p-2 rounded-lg hover:bg-card transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 text-muted" />
            </button>
          </div>
        </div>

        <div className="px-6 py-6 space-y-8">
          {/* ========== 外观模式 ========== */}
          <section>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/80 mb-3 block">
              外观模式
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'light' as const, label: '浅色', icon: Sun },
                { value: 'dark' as const, label: '深色', icon: Moon },
                { value: 'system' as const, label: '系统', icon: Monitor },
              ]).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                    theme === value
                      ? 'border-primary bg-primary/5 text-primary shadow-sm shadow-primary/10'
                      : 'border-card-border hover:border-primary/20 text-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[10px] font-bold">{label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ========== 预设主题 ========== */}
          <section>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/80 mb-3 block">
              预设主题
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => {
                const isActive = preset === p.id;
                const previewColors = p.colors[resolvedTheme];
                const previewPrimary = previewColors['--primary'] || (resolvedTheme === 'dark' ? '#d4a373' : '#b8860b');
                const previewBg = previewColors['--background'] || (resolvedTheme === 'dark' ? '#0c0c0c' : '#fafafa');
                const previewCard = previewColors['--card'] || (resolvedTheme === 'dark' ? '#161616' : '#ffffff');
                const previewBorder = previewColors['--card-border'] || (resolvedTheme === 'dark' ? '#2a2a2a' : '#e5e5e5');

                return (
                  <button
                    key={p.id}
                    onClick={() => handlePresetSelect(p)}
                    className={`group relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-card-border hover:border-primary/20'
                    }`}
                  >
                    {/* 颜色预览 */}
                    <div
                      className="w-full aspect-4/3 rounded-lg overflow-hidden border"
                      style={{ backgroundColor: previewBg, borderColor: previewBorder }}
                    >
                      <div className="h-full flex flex-col items-center justify-center gap-1 p-1.5">
                        <div
                          className="w-full h-2 rounded-full"
                          style={{ backgroundColor: previewPrimary }}
                        />
                        <div
                          className="w-3/4 h-1.5 rounded-full opacity-40"
                          style={{ backgroundColor: previewCard }}
                        />
                        <div
                          className="w-1/2 h-1.5 rounded-full opacity-30"
                          style={{ backgroundColor: previewCard }}
                        />
                      </div>
                    </div>
                    {/* 选中标记 */}
                    {isActive && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    )}
                    <span className="text-[9px] font-medium text-muted group-hover:text-foreground transition-colors leading-none">
                      {p.icon} {p.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ========== 自定义颜色 ========== */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/80">
                自定义颜色
              </label>
              <span className="text-[9px] text-muted/50 bg-card/80 px-2 py-0.5 rounded-full border border-card-border/50">
                {resolvedTheme === 'dark' ? '深色模式' : '浅色模式'}
              </span>
            </div>
            <div className="space-y-1.5">
              {COLOR_CONFIG.map(({ key, label, desc }) => {
                const color = getEffectiveColor(key);
                const isExpanded = expandedColor === key;

                return (
                  <div key={key} className="border border-card-border/60 rounded-xl overflow-hidden transition-colors hover:border-card-border">
                    <button
                      onClick={() => setExpandedColor(isExpanded ? null : key)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-card/30 transition-colors cursor-pointer"
                    >
                      <div
                        className="w-8 h-8 rounded-lg border-2 border-card-border/40 shrink-0 shadow-sm"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-xs font-semibold text-foreground">{label}</div>
                        <div className="text-[10px] text-muted/70 truncate">{desc}</div>
                      </div>
                      <span className="text-[10px] text-muted/60 font-mono shrink-0">{color}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-muted/40 shrink-0 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {/* 展开的颜色选择器 */}
                    <div
                      className={`transition-all duration-300 ease-out overflow-hidden ${
                        isExpanded ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="px-4 pb-4 space-y-3">
                        <div className="theme-color-picker">
                          <HexColorPicker
                            color={color}
                            onChange={(val) => handleColorChange(key, val)}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted font-mono">#</span>
                          <HexColorInput
                            color={color}
                            onChange={(val) => handleColorChange(key, `#${val}`)}
                            className="flex-1 px-3 py-2 bg-card border border-card-border rounded-lg text-xs font-mono text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                          />
                          {/* 快速预设色板 */}
                          <div className="flex gap-1">
                            {getQuickColors(key, resolvedTheme).map((c, i) => (
                              <button
                                key={`${c}-${i}`}
                                onClick={() => handleColorChange(key, c)}
                                className="w-6 h-6 rounded-md border border-card-border/40 hover:scale-110 transition-transform cursor-pointer"
                                style={{ backgroundColor: c }}
                                title={c}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ========== 重置按钮 ========== */}
          {preset !== 'default' && (
            <button
              onClick={() => {
                resetColors();
                setExpandedColor(null);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border border-card-border text-sm text-muted hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="font-medium">恢复默认主题</span>
            </button>
          )}

          {/* 底部提示 */}
          <p className="text-[10px] text-muted/40 text-center leading-relaxed pb-4">
            自定义颜色会自动保存到本地<br />深色和浅色模式的颜色独立配置
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* 触发按钮 */}
      <button
        onClick={() => setCustomizerOpen(true)}
        className="relative w-10 h-10 rounded-full border border-card-border bg-card hover:border-primary/30 transition-all duration-300 flex items-center justify-center cursor-pointer group"
        aria-label="自定义主题"
        type="button"
      >
        <Palette className="w-4 h-4 text-muted group-hover:text-primary transition-colors" />
      </button>

      {/* Portal: 渲染到 body，避免 header 的 backdrop-filter 层叠上下文问题 */}
      {mounted && createPortal(panelContent, document.body)}
    </>
  );
}

// ==================== 辅助函数 ====================

/** 获取每个颜色类型的快速选择预设 */
function getQuickColors(key: string, mode: string): string[] {
  const isDark = mode === 'dark';
  const map: Record<string, string[]> = {
    '--primary': ['#d4a373', '#5b9cf5', '#4ade80', '#a78bfa', '#f472b6', '#fb923c'],
    '--background': isDark
      ? ['#0c0c0c', '#0a0f1a', '#080f0b', '#0c0a14', '#111111', '#080812']
      : ['#fafafa', '#f4f8fc', '#f4faf5', '#f8f5ff', '#ffffff', '#f0f2ff'],
    '--foreground': isDark
      ? ['#f0f0f0', '#e4eaf4', '#e0f0e4', '#e8e2f5', '#eeeeee', '#e0f0ff']
      : ['#1a1a1a', '#1a2a3a', '#1a2e1e', '#2a1a3e', '#111111', '#1a1a2e'],
    '--card': isDark
      ? ['#161616', '#111b2e', '#0f1e14', '#15102a', '#1a1a1a', '#0e0e22']
      : ['#ffffff', '#f9fafb', '#f5f5f5', '#faf5ff', '#f8f8f8', '#f0f5ff'],
    '--card-border': isDark
      ? ['#2a2a2a', '#1c2e4d', '#1c3524', '#271e48', '#2c2c2c', '#1a1a40']
      : ['#e5e5e5', '#d0dff0', '#c8e0d0', '#dcd0f0', '#e0e0e0', '#d0d5ee'],
    '--muted': isDark
      ? ['#a0a0a0', '#8899b5', '#82a590', '#9088a8', '#888888', '#7888bb']
      : ['#6b7280', '#6882a0', '#5c8a6a', '#7a6b90', '#888888', '#6b6b90'],
  };
  return map[key] || [];
}
