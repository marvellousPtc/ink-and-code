'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowLeft, Save, Globe, User, Link2, Loader2, CheckCircle2, XCircle, Copy, ExternalLink, Sparkles, Image, Eye, EyeOff, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  username: string | null;
  bio: string | null;
  headline: string | null;
}

interface SiteConfig {
  siteName: string | null;
  siteTagline: string | null;
  primaryColor: string | null;
  githubUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  // OSS 配置
  ossRegion: string | null;
  ossBucket: string | null;
  ossAccessKeyId: string | null;
  ossAccessKeySecret: string | null;
  ossDir: string | null;
  ossDomain: string | null;
}

// 阿里云 OSS 区域列表
const OSS_REGIONS = [
  { value: 'oss-cn-hangzhou', label: '华东1（杭州）' },
  { value: 'oss-cn-shanghai', label: '华东2（上海）' },
  { value: 'oss-cn-qingdao', label: '华北1（青岛）' },
  { value: 'oss-cn-beijing', label: '华北2（北京）' },
  { value: 'oss-cn-zhangjiakou', label: '华北3（张家口）' },
  { value: 'oss-cn-huhehaote', label: '华北5（呼和浩特）' },
  { value: 'oss-cn-shenzhen', label: '华南1（深圳）' },
  { value: 'oss-cn-guangzhou', label: '华南2（广州）' },
  { value: 'oss-cn-chengdu', label: '西南1（成都）' },
  { value: 'oss-cn-hongkong', label: '中国香港' },
  { value: 'oss-ap-southeast-1', label: '新加坡' },
  { value: 'oss-us-west-1', label: '美国西部' },
];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 用户名检测状态
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    reason: string | null;
  }>({ checking: false, available: null, reason: null });
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 用户资料
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileForm, setProfileForm] = useState({
    username: '',
    name: '',
    headline: '',
    bio: '',
  });

  // 检查用户名是否可用（防抖）
  const checkUsername = useCallback(async (username: string, originalUsername: string | null) => {
    if (username === originalUsername) {
      setUsernameStatus({ checking: false, available: null, reason: null });
      return;
    }

    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    if (!username || username.length < 3) {
      setUsernameStatus({ checking: false, available: null, reason: username ? '用户名至少 3 个字符' : null });
      return;
    }

    setUsernameStatus({ checking: true, available: null, reason: null });

    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/user/check-username?username=${encodeURIComponent(username)}`);
        const data = await res.json();
        
        if (data.data) {
          setUsernameStatus({
            checking: false,
            available: data.data.available,
            reason: data.data.reason,
          });
        }
      } catch {
        setUsernameStatus({ checking: false, available: null, reason: '检测失败' });
      }
    }, 500);
  }, []);

  const handleUsernameChange = (value: string) => {
    setProfileForm({ ...profileForm, username: value });
    checkUsername(value, profile?.username || null);
  };

  // 站点配置
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [siteForm, setSiteForm] = useState({
    siteName: '',
    siteTagline: '',
    githubUrl: '',
    twitterUrl: '',
    linkedinUrl: '',
    websiteUrl: '',
    // OSS 配置
    ossRegion: '',
    ossBucket: '',
    ossAccessKeyId: '',
    ossAccessKeySecret: '',
    ossDir: '',
    ossDomain: '',
  });
  
  // OSS 相关状态
  const [showOssSecret, setShowOssSecret] = useState(false);
  const [testingOss, setTestingOss] = useState(false);
  const [ossTestResult, setOssTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showOssHelp, setShowOssHelp] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      loadData();
    }
  }, [status]);

  const loadData = async () => {
    try {
      const [profileRes, siteRes] = await Promise.all([
        fetch('/api/user/profile'),
        fetch('/api/user/site-config'),
      ]);

      const profileData = await profileRes.json();
      const siteData = await siteRes.json();

      if (profileData.data) {
        setProfile(profileData.data);
        
        let defaultUsername = profileData.data.username || '';
        if (!defaultUsername && profileData.data.name) {
          const baseName = profileData.data.name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .slice(0, 15) || 'user';
          const randomSuffix = Math.random().toString(36).slice(2, 8);
          defaultUsername = `${baseName}-${randomSuffix}`;
        }
        
        setProfileForm({
          username: defaultUsername,
          name: profileData.data.name || '',
          headline: profileData.data.headline || '',
          bio: profileData.data.bio || '',
        });
        
        if (!profileData.data.username && defaultUsername) {
          checkUsername(defaultUsername, null);
        }
      }

      if (siteData.data) {
        setSiteConfig(siteData.data);
        setSiteForm({
          siteName: siteData.data.siteName || '',
          siteTagline: siteData.data.siteTagline || '',
          githubUrl: siteData.data.githubUrl || '',
          twitterUrl: siteData.data.twitterUrl || '',
          linkedinUrl: siteData.data.linkedinUrl || '',
          websiteUrl: siteData.data.websiteUrl || '',
          // OSS 配置
          ossRegion: siteData.data.ossRegion || '',
          ossBucket: siteData.data.ossBucket || '',
          ossAccessKeyId: siteData.data.ossAccessKeyId || '',
          ossAccessKeySecret: siteData.data.ossAccessKeySecret || '',
          ossDir: siteData.data.ossDir || '',
          ossDomain: siteData.data.ossDomain || '',
        });
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/u/${profile?.username || profileForm.username}`;
    try {
      await navigator.clipboard.writeText(url);
      showMessage('success', '链接已复制到剪贴板');
    } catch {
      showMessage('error', '复制失败，请手动复制');
    }
  };

  // 测试 OSS 连接
  const testOssConnection = async () => {
    // 先保存配置
    if (!siteForm.ossRegion || !siteForm.ossBucket || !siteForm.ossAccessKeyId || !siteForm.ossAccessKeySecret) {
      setOssTestResult({ success: false, message: '请先填写完整的 OSS 配置' });
      return;
    }
    
    setTestingOss(true);
    setOssTestResult(null);
    
    try {
      // 先保存配置
      await fetch('/api/user/site-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(siteForm),
      });
      
      // 测试连接
      const res = await fetch('/api/upload/image');
      const data = await res.json();
      
      setOssTestResult({
        success: data.data?.connected || false,
        message: data.message,
      });
    } catch {
      setOssTestResult({ success: false, message: '测试失败，请检查网络' });
    } finally {
      setTestingOss(false);
    }
  };

  const [saving, setSaving] = useState(false);

  const saveAll = async () => {
    setSaving(true);
    try {
      const [profileRes, siteRes] = await Promise.all([
        fetch('/api/user/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profileForm),
        }),
        fetch('/api/user/site-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(siteForm),
        }),
      ]);

      const profileData = await profileRes.json();
      const siteData = await siteRes.json();

      if (profileData.code >= 400) {
        showMessage('error', profileData.message || '保存个人资料失败');
        return;
      }

      if (siteData.code >= 400) {
        showMessage('error', siteData.message || '保存站点配置失败');
        return;
      }

      setProfile(profileData.data);
      setSiteConfig(siteData.data);
      setUsernameStatus({ checking: false, available: null, reason: null });
      showMessage('success', '保存成功！你的主页已更新');
    } catch {
      showMessage('error', '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted">加载中...</p>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">请先登录</h1>
          <Link href="/login" className="text-primary hover:underline">
            前往登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin"
            className="w-10 h-10 rounded-full border border-card-border bg-card/50 flex items-center justify-center text-muted hover:text-foreground hover:bg-card hover:scale-105 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">设置你的主页</h1>
            <p className="text-sm text-muted">填写信息后保存，即可生成专属链接</p>
          </div>
        </div>

        {/* 分享链接卡片 */}
        {profile?.username && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border border-primary/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">你的主页已生成</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 bg-background/80 rounded-lg border border-card-border truncate">
                <code className="text-sm text-foreground">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/u/{profile.username}
                </code>
              </div>
              <button
                onClick={copyLink}
                className="shrink-0 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5"
              >
                <Copy className="w-4 h-4" />
                复制
              </button>
              <a
                href={`/u/${profile.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-3 py-2 bg-card border border-card-border rounded-lg text-sm font-medium hover:bg-card-border/30 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" />
                访问
              </a>
            </div>
          </div>
        )}

        {/* 表单区域 */}
        <div className="space-y-6">
          {/* 用户名 - 最重要，单独一个卡片 */}
          <div className="p-5 rounded-2xl border border-card-border bg-card/20">
            <div className="flex items-center gap-2 mb-4">
              <Link2 className="w-4 h-4 text-primary" />
              <label className="text-sm font-semibold text-foreground">
                用户名 <span className="text-red-400">*</span>
              </label>
              {!profile?.username && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">
                  必填
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted text-sm font-mono">/u/</span>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={profileForm.username}
                  onChange={(e) => handleUsernameChange(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="your-username"
                  className={`w-full px-3 py-2.5 pr-10 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 transition-all font-mono ${
                    usernameStatus.available === true
                      ? 'border-green-500/50 focus:ring-green-500/20 focus:border-green-500'
                      : usernameStatus.available === false
                      ? 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500'
                      : 'border-card-border focus:ring-primary/20 focus:border-primary/40'
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus.checking && <Loader2 className="w-4 h-4 animate-spin text-muted" />}
                  {!usernameStatus.checking && usernameStatus.available === true && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {!usernameStatus.checking && usernameStatus.available === false && <XCircle className="w-4 h-4 text-red-500" />}
                </div>
              </div>
            </div>
            <p className={`mt-2 text-xs ${usernameStatus.available === false ? 'text-red-500' : 'text-muted'}`}>
              {usernameStatus.reason || (profileForm.username === profile?.username ? '这是你当前的用户名' : '只能包含字母、数字、下划线和短横线')}
            </p>
          </div>

          {/* 个人资料 */}
          <div className="p-5 rounded-2xl border border-card-border bg-card/20">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-foreground">个人资料</span>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-muted mb-1.5">显示名称</label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="你的名字"
                  className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs text-muted mb-1.5">一句话介绍</label>
                <input
                  type="text"
                  value={profileForm.headline}
                  onChange={(e) => setProfileForm({ ...profileForm, headline: e.target.value })}
                  placeholder="例如：全栈开发者 / 设计师"
                  className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs text-muted mb-1.5">个人简介</label>
                <textarea
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                  placeholder="介绍一下你自己..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all resize-none"
                />
              </div>
            </div>
          </div>

          {/* 站点配置 */}
          <div className="p-5 rounded-2xl border border-card-border bg-card/20">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-semibold text-foreground">站点配置</span>
              <span className="text-xs text-muted">（可选）</span>
            </div>
            
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted mb-1.5">站点名称</label>
                  <input
                    type="text"
                    value={siteForm.siteName}
                    onChange={(e) => setSiteForm({ ...siteForm, siteName: e.target.value })}
                    placeholder="我的博客"
                    className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">站点标语</label>
                  <input
                    type="text"
                    value={siteForm.siteTagline}
                    onChange={(e) => setSiteForm({ ...siteForm, siteTagline: e.target.value })}
                    placeholder="记录生活，分享技术"
                    className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-card-border/50">
                <p className="text-xs text-muted mb-3">社交链接</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <input
                    type="url"
                    value={siteForm.githubUrl}
                    onChange={(e) => setSiteForm({ ...siteForm, githubUrl: e.target.value })}
                    placeholder="GitHub 链接"
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                  <input
                    type="url"
                    value={siteForm.twitterUrl}
                    onChange={(e) => setSiteForm({ ...siteForm, twitterUrl: e.target.value })}
                    placeholder="Twitter 链接"
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                  <input
                    type="url"
                    value={siteForm.linkedinUrl}
                    onChange={(e) => setSiteForm({ ...siteForm, linkedinUrl: e.target.value })}
                    placeholder="LinkedIn 链接"
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                  <input
                    type="url"
                    value={siteForm.websiteUrl}
                    onChange={(e) => setSiteForm({ ...siteForm, websiteUrl: e.target.value })}
                    placeholder="个人网站"
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 图床配置 */}
          <div className="p-5 rounded-2xl border border-card-border bg-card/20">
            <div className="flex items-center gap-2 mb-4">
              <Image className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-semibold text-foreground">图床配置</span>
              <span className="text-xs text-muted">（阿里云 OSS）</span>
            </div>
            
            <p className="text-xs text-muted mb-4">
              配置图床后，在编辑器中粘贴或拖拽图片会自动上传。
              <span className="text-orange-500">注意：Bucket 需设为「公共读」权限才能正常显示图片</span>
            </p>
            
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted mb-1.5">Region 区域</label>
                  <select
                    value={siteForm.ossRegion}
                    onChange={(e) => setSiteForm({ ...siteForm, ossRegion: e.target.value })}
                    className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  >
                    <option value="">请选择区域</option>
                    {OSS_REGIONS.map((region) => (
                      <option key={region.value} value={region.value}>
                        {region.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Bucket 名称</label>
                  <input
                    type="text"
                    value={siteForm.ossBucket}
                    onChange={(e) => setSiteForm({ ...siteForm, ossBucket: e.target.value })}
                    placeholder="your-bucket-name"
                    className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted mb-1.5">AccessKey ID</label>
                  <input
                    type="text"
                    value={siteForm.ossAccessKeyId}
                    onChange={(e) => setSiteForm({ ...siteForm, ossAccessKeyId: e.target.value })}
                    placeholder="LTAI5t..."
                    className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">AccessKey Secret</label>
                  <div className="relative">
                    <input
                      type={showOssSecret ? 'text' : 'password'}
                      value={siteForm.ossAccessKeySecret}
                      onChange={(e) => setSiteForm({ ...siteForm, ossAccessKeySecret: e.target.value })}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 pr-10 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOssSecret(!showOssSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                    >
                      {showOssSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted mb-1.5">存储目录</label>
                  <input
                    type="text"
                    value={siteForm.ossDir}
                    onChange={(e) => setSiteForm({ ...siteForm, ossDir: e.target.value })}
                    placeholder="blog/images"
                    className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                  <p className="mt-1 text-[10px] text-muted">图片存储的文件夹路径</p>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">自定义域名（可选）</label>
                  <input
                    type="text"
                    value={siteForm.ossDomain}
                    onChange={(e) => setSiteForm({ ...siteForm, ossDomain: e.target.value })}
                    placeholder="https://cdn.example.com"
                    className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                  <p className="mt-1 text-[10px] text-muted">绑定的 CDN 或自定义域名</p>
                </div>
              </div>

              {/* 测试连接 */}
              <div className="pt-3 border-t border-card-border/50 flex items-center gap-3">
                <button
                  type="button"
                  onClick={testOssConnection}
                  disabled={testingOss}
                  className="px-4 py-2 bg-card border border-card-border rounded-lg text-sm font-medium hover:bg-card-border/30 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {testingOss ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      测试中...
                    </>
                  ) : (
                    '测试连接'
                  )}
                </button>
                {ossTestResult && (
                  <span className={`text-xs flex items-center gap-1 ${ossTestResult.success ? 'text-green-500' : 'text-red-500'}`}>
                    {ossTestResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {ossTestResult.message}
                  </span>
                )}
              </div>

              {/* 配置帮助 */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowOssHelp(!showOssHelp)}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>配置遇到问题？查看帮助</span>
                  {showOssHelp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                
                {showOssHelp && (
                  <div className="mt-3 p-4 bg-background/50 border border-card-border/50 rounded-lg text-xs text-muted space-y-3">
                    <div>
                      <p className="font-medium text-foreground mb-1">1. 创建 RAM 子账号（推荐）</p>
                      <p>前往 <a href="https://ram.console.aliyun.com/users" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">RAM 访问控制</a> → 用户 → 创建用户 → 勾选「OpenAPI 调用访问」→ 保存 AccessKey</p>
                    </div>
                    
                    <div>
                      <p className="font-medium text-foreground mb-1">2. 授予 OSS 权限</p>
                      <p>在 RAM 用户详情 → 权限管理 → 新增授权 → 搜索并添加 <code className="px-1 py-0.5 bg-card rounded">AliyunOSSFullAccess</code></p>
                    </div>
                    
                    <div>
                      <p className="font-medium text-foreground mb-1">3. 确认 Bucket 信息</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>在 <a href="https://oss.console.aliyun.com/bucket" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">OSS 控制台</a> 确认 Bucket 名称正确</li>
                        <li>确认 Region 与 Bucket 所在区域一致（查看 Bucket 概览的 Endpoint 地址）</li>
                        <li>确认创建 Bucket 和 RAM 用户的是同一个阿里云账号</li>
                        <li className="text-orange-500">⚠️ Bucket 读写权限需设为<strong>「公共读」</strong>，否则图片无法显示</li>
                      </ul>
                    </div>
                    
                    <div>
                      <p className="font-medium text-foreground mb-1">4. 常见错误</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><code className="px-1 py-0.5 bg-card rounded">AccessDenied</code>：RAM 用户没有 OSS 权限，请添加授权</li>
                        <li><code className="px-1 py-0.5 bg-card rounded">NoSuchBucket</code>：Bucket 名称错误或 Region 不匹配</li>
                        <li><code className="px-1 py-0.5 bg-card rounded">InvalidAccessKeyId</code>：AccessKey ID 错误或已禁用</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 底部保存区域 */}
        <div className="mt-8 sticky bottom-6">
          <div className="p-4 rounded-2xl bg-card/80 backdrop-blur-lg border border-card-border shadow-xl">
            {/* 消息提示 */}
            {message && (
              <div
                className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
                  message.type === 'success'
                    ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                    : 'bg-red-500/10 text-red-500 border border-red-500/20'
                }`}
              >
                {message.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0" />
                )}
                {message.text}
              </div>
            )}
            
            <button
              onClick={saveAll}
              disabled={saving || usernameStatus.checking || usernameStatus.available === false || !profileForm.username}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  保存设置
                </>
              )}
            </button>
            
            {!profile?.username && (
              <p className="mt-3 text-center text-xs text-muted">
                保存后即可生成你的专属分享链接
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
