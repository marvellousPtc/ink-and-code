'use client'

import { useState, useRef, useEffect } from 'react'
import { signOut } from 'next-auth/react'
import Link from 'next/link'
import { LogOut, LayoutDashboard, User, Shield } from 'lucide-react'

interface UserMenuProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export default function UserMenu({ user }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [canAccessAdmin, setCanAccessAdmin] = useState(false) // 是否可以访问管理后台（开发者或管理者）
  const [isDeveloper, setIsDeveloper] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 检查是否是开发者或管理者
  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const res = await fetch('/api/admin/verify')
        const data = await res.json()
        if (data.code === 200 && data.data?.authorized) {
          setCanAccessAdmin(true)
          setIsDeveloper(data.data.isDeveloper === true)
        }
      } catch {
        // 忽略错误
      }
    }
    checkAdminAccess()
  }, [])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-full hover:bg-card-border/40 transition-colors cursor-pointer"
      >
        {user.image ? (
          <img
            src={user.image}
            alt={user.name || 'User'}
            className="w-8 h-8 rounded-full ring-2 ring-card-border hover:ring-primary/50 transition-all cursor-pointer"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-card-border hover:ring-primary/50 transition-all cursor-pointer">
            <User className="w-4 h-4 text-primary" />
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-card/95 backdrop-blur-xl border border-card-border rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          {/* 用户信息 */}
          <div className="px-4 py-3 border-b border-card-border/60">
            <p className="text-sm font-semibold truncate">{user.name || '用户'}</p>
            <p className="text-xs text-muted truncate">{user.email}</p>
          </div>

          {/* 菜单项 */}
          <div className="py-2">
            <Link
              href="/admin"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:text-foreground hover:bg-card-border/40 transition-colors cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>控制台</span>
            </Link>
            {canAccessAdmin && (
              <Link
                href="/developer"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                  isDeveloper 
                    ? 'text-primary hover:bg-primary/10' 
                    : 'text-purple-500 hover:bg-purple-500/10'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>{isDeveloper ? '开发者后台' : '管理后台'}</span>
              </Link>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
