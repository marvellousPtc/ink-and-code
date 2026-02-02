'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ThemeToggle from './ThemeToggle';
import UserMenu from './UserMenu';
import { Github, LogIn, Menu, X } from 'lucide-react';

const navItems = [
  { href: '/', label: '首页' },
  { href: '/blog', label: '文章' },
  { href: '/about', label: '关于' },
];

export default function Header() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen]);

  // 路由变化时关闭菜单
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4 sm:gap-8">
        <Link 
          href="/" 
          className="serif text-xl sm:text-2xl font-bold tracking-tighter hover:opacity-70 transition-opacity shrink-0"
        >
          Ink<span className="text-primary">&</span>Code
        </Link>

        <div className="flex items-center gap-2 sm:gap-8">
          {/* 桌面端导航 */}
          <ul className="hidden sm:flex items-center gap-4 sm:gap-8">
            {navItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/' && pathname.startsWith(item.href));
              
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`
                      text-[11px] sm:text-[13px] tracking-wider sm:tracking-widest uppercase transition-colors duration-300 whitespace-nowrap
                      ${isActive ? 'text-primary' : 'text-muted hover:text-foreground'}
                    `}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          
          <a
            href="https://github.com/marvellousPtc/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-foreground transition-colors duration-300 hidden sm:block"
            aria-label="GitHub"
          >
            <Github className="w-5 h-5" />
          </a>
          
          <ThemeToggle />

          {/* 用户认证状态 */}
          {status === 'loading' ? (
            <div className="w-8 h-8 rounded-full bg-card-border/40 animate-pulse" />
          ) : session?.user ? (
            <UserMenu user={session.user} />
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-full text-[11px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">登录</span>
            </Link>
          )}

          {/* 移动端菜单按钮 */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sm:hidden p-2 text-muted hover:text-foreground transition-colors"
            aria-label="菜单"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* 移动端下拉菜单 */}
      {mobileMenuOpen && (
        <div 
          ref={menuRef}
          className="sm:hidden absolute top-full left-0 right-0 bg-background/95 backdrop-blur-xl border-b border-card-border shadow-lg animate-in slide-in-from-top-2 duration-200"
        >
          <div className="px-4 py-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/' && pathname.startsWith(item.href));
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isActive 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-muted hover:text-foreground hover:bg-card-border/30'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            
            <a
              href="https://github.com/marvellousPtc/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-muted hover:text-foreground hover:bg-card-border/30 transition-colors"
            >
              <Github className="w-4 h-4" />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
