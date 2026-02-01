'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import { Sun, Moon, Monitor } from 'lucide-react';

const themes = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const;

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme, mounted } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 在客户端挂载前显示占位符
  if (!mounted) {
    return (
      <div className="w-10 h-10 rounded-full border border-card-border bg-card" />
    );
  }

  const currentIcon = theme === 'system' 
    ? Monitor 
    : resolvedTheme === 'dark' 
      ? Moon 
      : Sun;

  const CurrentIcon = currentIcon;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-10 h-10 rounded-full border border-card-border bg-card hover:border-primary/30 transition-all duration-300 flex items-center justify-center cursor-pointer"
        aria-label="切换主题"
        type="button"
      >
        <CurrentIcon 
          className={`w-4 h-4 transition-colors ${
            theme === 'system' 
              ? 'text-muted' 
              : resolvedTheme === 'dark' 
                ? 'text-primary' 
                : 'text-amber-500'
          }`} 
        />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 py-2 w-36 bg-card border border-card-border rounded-xl shadow-xl z-50 animate-fade-up">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => {
                setTheme(value);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2 flex items-center gap-3 text-sm transition-colors ${
                theme === value 
                  ? 'text-primary bg-primary/5' 
                  : 'text-muted hover:text-foreground hover:bg-card-border/30'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              {theme === value && (
                <span className="ml-auto text-primary">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
