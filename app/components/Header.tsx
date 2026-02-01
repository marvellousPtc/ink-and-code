'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { Github } from 'lucide-react';

const navItems = [
  { href: '/', label: '首页' },
  { href: '/blog', label: '文章' },
  { href: '/about', label: '关于' },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4 sm:gap-8">
        <Link 
          href="/" 
          className="serif text-xl sm:text-2xl font-bold tracking-tighter hover:opacity-70 transition-opacity shrink-0"
        >
          Ink<span className="text-primary">&</span>Code
        </Link>

        <div className="flex items-center gap-4 sm:gap-8">
          <ul className="flex items-center gap-4 sm:gap-8">
            {navItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/' && pathname.startsWith(item.href));
              
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`
                      text-[11px] sm:text-[13px] tracking-wider sm:tracking-widest uppercase transition-colors duration-300
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
            className="text-muted hover:text-foreground transition-colors duration-300"
            aria-label="GitHub"
          >
            <Github className="w-5 h-5" />
          </a>
          
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
