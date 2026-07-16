'use client';

import { FolderOpen, Loader2, CheckCircle2, XCircle, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { AutoSaveField } from './AutoSaveField';

interface LocalStorageConfigData {
  storageType: string | null;
  localStoragePath: string | null;
}

interface LocalStorageSectionProps {
  config: LocalStorageConfigData;
  onUpdate: (data: Partial<LocalStorageConfigData>) => Promise<void>;
  onTestConnection: () => Promise<void>;
  testResult: { success: boolean; message: string } | null;
  isTesting: boolean;
}

export function LocalStorageSection({ config, onUpdate, onTestConnection, testResult, isTesting }: LocalStorageSectionProps) {
  const [showHelp, setShowHelp] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if configured for local storage
  const isLocalStorage = config.storageType === 'local';
  const isConfigured = !!(config.storageType === 'local' && config.localStoragePath);
  const hasStorageType = config.storageType !== null && config.storageType !== '';

  return (
    <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
      <div 
        className="p-4 border-b border-card-border/50 bg-card/50 flex items-center justify-between cursor-pointer hover:bg-card/80 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-foreground">存储配置</h2>
          <span className="text-xs text-muted">（本地存储）</span>
        </div>
        <div className="flex items-center gap-2">
          {isConfigured ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              已配置
            </span>
          ) : hasStorageType ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">
              待配置
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted/20 text-muted border border-card-border">
              未配置
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-4 space-y-5 animate-in slide-in-from-top-2 duration-200">
          {!hasStorageType ? (
            <p className="text-xs text-muted">
              请先选择存储方式，保存后将显示相应的配置选项。
            </p>
          ) : config.storageType === 'local' ? (
            <p className="text-xs text-muted">
              选择本地存储方式，图片将保存在服务器本地文件系统中。
            </p>
          ) : (
            <p className="text-xs text-muted">
              当前使用阿里云 OSS，图片将上传到云存储。
              如需切换到本地存储，请选择"本地存储"并保存。
            </p>
          )}

          {/* 存储类型选择 */}
          <div className="grid gap-4">
            <AutoSaveField
              label="存储方式"
              value={config.storageType || ''}
              onSave={async (val) => {
                await onUpdate({ storageType: val || null });
                // Reset localStoragePath when switching away from local
                if (val !== 'local') {
                  await onUpdate({ localStoragePath: null });
                }
              }}
              type="select"
              options={[
                { value: 'oss', label: '阿里云 OSS' },
                { value: 'local', label: '本地存储' },
              ]}
              placeholder="选择存储方式"
            />

            {config.storageType === 'local' && (
              <AutoSaveField
                label="本地存储路径"
                value={config.localStoragePath || ''}
                onSave={async (val) => await onUpdate({ localStoragePath: val || null })}
                placeholder="uploads/images"
                description="相对于 public 目录的存储路径，支持格式如：uploads、uploads/${userId} 等"
              />
            )}
          </div>

          {/* Test Connection */}
          {config.storageType === 'local' && (
            <div className="pt-4 border-t border-card-border/50 flex items-center gap-3">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onTestConnection(); }}
                disabled={isTesting}
                className="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    测试中...
                  </>
                ) : (
                  '测试连接'
                )}
              </button>
              {testResult && (
                <span className={`text-xs flex items-center gap-1 ${testResult.success ? 'text-green-500' : 'text-red-500'}`}>
                  {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {testResult.message}
                </span>
              )}
            </div>
          )}

          {/* Help Section - Always visible when expanded */}
          <div className="border-t border-card-border/50 pt-4">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowHelp(!showHelp);
              }}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors w-full"
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              <span>本地存储说明</span>
              {showHelp ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
            </button>
            
            {showHelp && (
              <div className="mt-3 p-4 bg-muted/30 border border-card-border/50 rounded-lg text-xs text-muted space-y-3">
                <div>
                  <p className="font-medium text-foreground mb-1">什么是本地存储？</p>
                  <p>本地存储将图片保存在服务器的文件系统中，无需配置阿里云 OSS。</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">路径格式</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><code className="px-1 py-0.5 bg-card rounded">uploads</code> - 保存到 public/uploads</li>
                    <li><code className="px-1 py-0.5 bg-card rounded">images/${userId}</code> - 保存到 public/images/[用户ID]</li>
                    <li><code className="px-1 py-0.5 bg-card rounded">uploads/%Y/%m</code> - 支持日期格式</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">注意事项</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>确保服务器有足够的磁盘空间</li>
                    <li>路径不支持绝对路径和 .. 跳转</li>
                    <li>生产环境建议使用 OSS 获得更好的访问速度</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
