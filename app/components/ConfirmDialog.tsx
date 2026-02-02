'use client';

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertCircle, Trash2, HelpCircle } from 'lucide-react';

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
}

interface ConfirmProviderProps {
  children: ReactNode;
}

export function ConfirmProvider({ children }: ConfirmProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: '确认',
    description: '',
    confirmText: '确定',
    cancelText: '取消',
    variant: 'default',
  });
  // 使用 ref 存储 resolve 函数，避免闭包问题
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions({
      title: opts.title || '确认',
      description: opts.description,
      confirmText: opts.confirmText || '确定',
      cancelText: opts.cancelText || '取消',
      variant: opts.variant || 'default',
    });
    setIsOpen(true);

    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          resolveRef.current?.(false);
          resolveRef.current = null;
        }
        setIsOpen(open);
      }}>
        <AlertDialogContent className="bg-background border border-card-border sm:max-w-[380px] rounded-2xl shadow-2xl p-6 overflow-hidden gap-0">
            <AlertDialogHeader className="space-y-4">
              {/* 图标 */}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                options.variant === 'destructive' 
                  ? 'bg-red-500/10 text-red-500' 
                  : 'bg-primary/10 text-primary'
              }`}>
                {options.variant === 'destructive' ? (
                  <Trash2 className="w-6 h-6" />
                ) : (
                  <AlertCircle className="w-6 h-6" />
                )}
              </div>
              
              {/* 标题 */}
              <AlertDialogTitle className="text-lg font-semibold text-foreground">
                {options.title}
              </AlertDialogTitle>
              
              {/* 描述 */}
              <AlertDialogDescription className="text-muted text-sm leading-relaxed">
                {options.description}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="flex-row gap-3 mt-6">
              <AlertDialogCancel
                onClick={handleCancel}
                className="flex-1 bg-card hover:bg-card-border/50 border border-card-border text-foreground rounded-xl h-10 font-medium text-sm transition-all cursor-pointer"
              >
                {options.cancelText}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirm}
                className={`flex-1 border-0 rounded-xl h-10 font-medium text-sm transition-all cursor-pointer ${
                  options.variant === 'destructive'
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {options.confirmText}
              </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
