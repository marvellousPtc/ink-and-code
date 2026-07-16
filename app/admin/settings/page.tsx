'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Sparkles, Copy, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';
import { ProfileSection } from './components/ProfileSection';
import { SiteInfoSection } from './components/SiteInfoSection';
import { SocialLinksSection } from './components/SocialLinksSection';
import { OssConfigSection } from './components/OssConfigSection';
import { LocalStorageSection } from './components/LocalStorageSection';
import { ApiTokenSection } from './components/ApiTokenSection';

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
  // OSS
  ossRegion: string | null;
  ossBucket: string | null;
  ossAccessKeyId: string | null;
  ossAccessKeySecret: string | null;
  ossDir: string | null;
  ossDomain: string | null;
  // Storage Type
  storageType: string | null;
  localStoragePath: string | null;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [siteConfig, setSiteConfig] = useState<SiteConfig>({
    siteName: '', siteTagline: '', primaryColor: '',
    githubUrl: '', twitterUrl: '', linkedinUrl: '', websiteUrl: '',
    ossRegion: '', ossBucket: '', ossAccessKeyId: '', ossAccessKeySecret: '', ossDir: '', ossDomain: '',
    storageType: '', localStoragePath: ''
  });

  // OSS Test State
  const [testingOss, setTestingOss] = useState(false);
  const [ossTestResult, setOssTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Local Storage Test State
  const [testingLocal, setTestingLocal] = useState(false);
  const [localTestResult, setLocalTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [profileRes, siteRes] = await Promise.all([
        fetch('/api/user/profile'),
        fetch('/api/user/site-config'),
      ]);

      const profileData = await profileRes.json();
      const siteData = await siteRes.json();

      if (profileData.data) {
        setProfile(profileData.data);
      }

      if (siteData.data) {
        setSiteConfig(siteData.data);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      showMessage('error', '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      loadData();
    }
  }, [status, loadData]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // Update Profile
  const handleUpdateProfile = async (data: Partial<UserProfile>) => {
    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      
      if (result.code >= 400) {
        throw new Error(result.message);
      }
      
      setProfile(prev => prev ? { ...prev, ...data } : null);
      // Optional: showMessage('success', '已保存'); // AutoSaveField shows its own indicator
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败';
      showMessage('error', message);
      throw error;
    }
  };

  // Update Site Config
  const handleUpdateSiteConfig = async (data: Partial<SiteConfig>) => {
    try {
      const res = await fetch('/api/user/site-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (result.code >= 400) {
        throw new Error(result.message);
      }

      setSiteConfig(prev => ({ ...prev, ...data }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败';
      showMessage('error', message);
      throw error;
    }
  };

  // Check Username Availability
  const checkUsernameAvailability = async (username: string) => {
    const res = await fetch(`/api/user/check-username?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    return {
        available: data.data?.available ?? false,
        reason: data.data?.reason ?? '检测失败'
    };
  };

  // Test OSS Connection
  const testOssConnection = async () => {
    if (!siteConfig.ossRegion || !siteConfig.ossBucket || !siteConfig.ossAccessKeyId || !siteConfig.ossAccessKeySecret) {
      setOssTestResult({ success: false, message: '请先填写完整的 OSS 配置' });
      return;
    }
    
    setTestingOss(true);
    setOssTestResult(null);
    
    try {
      // Ensure backend has latest config (AutoSave should have handled it, but just in case)
      // Actually we rely on what's in DB for the test endpoint mostly, but for "test connection" usually we want to test current inputs.
      // The current implementation of /api/upload/image (GET) uses DB config.
      // So we must ensure it's saved. AutoSave saves on blur.
      // If user just typed and clicked test, onBlur fires.
      // But we can force save here if we want? No, handleUpdateSiteConfig updates DB.
      // We assume it's up to date.
      
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

  // Test Local Storage Connection
  const testLocalConnection = async () => {
    setTestingLocal(true);
    setLocalTestResult(null);
    
    try {
      const res = await fetch('/api/upload/image/local');
      const data = await res.json();
      
      setLocalTestResult({
        success: data.data?.connected || false,
        message: data.message,
      });
    } catch {
      setLocalTestResult({ success: false, message: '测试失败，请检查网络' });
    } finally {
      setTestingLocal(false);
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/u/${profile?.username}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        showMessage('success', '链接已复制');
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (success) showMessage('success', '链接已复制');
        else showMessage('error', '复制失败');
      }
    } catch {
      showMessage('error', '复制失败');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">请先登录</h1>
          <Link href="/login" className="text-primary hover:underline">前往登录</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
                <Link
                    href="/admin"
                    className="w-10 h-10 rounded-full border border-card-border bg-card/50 flex items-center justify-center text-muted hover:text-foreground hover:bg-card hover:scale-105 transition-all"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">设置</h1>
                    <p className="text-sm text-muted">管理你的个人资料和站点配置</p>
                </div>
            </div>

            {/* Link Share Card */}
            {profile?.username && (
                <div className="flex items-center gap-2 p-1.5 pr-3 bg-card border border-card-border rounded-xl shadow-sm">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-muted uppercase font-bold tracking-wider">Your Page</span>
                        <code className="text-xs font-medium text-foreground">/u/{profile.username}</code>
                    </div>
                    <div className="w-px h-6 bg-card-border mx-2" />
                    <button 
                        onClick={copyLink}
                        className="p-1.5 text-muted hover:text-foreground hover:bg-muted/10 rounded-lg transition-colors cursor-pointer"
                        title="复制链接"
                    >
                        <Copy className="w-4 h-4" />
                    </button>
                    <a 
                        href={`/u/${profile.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-muted hover:text-foreground hover:bg-muted/10 rounded-lg transition-colors cursor-pointer"
                        title="访问主页"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </a>
                </div>
            )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
                {profile && (
                    <ProfileSection 
                        profile={profile} 
                        onUpdate={handleUpdateProfile}
                        checkUsernameAvailability={checkUsernameAvailability}
                    />
                )}
                
                <SiteInfoSection 
                    info={siteConfig} 
                    onUpdate={handleUpdateSiteConfig} 
                />
            </div>

            {/* Right Column */}
            <div className="space-y-6">
                <SocialLinksSection 
                    config={siteConfig} 
                    onUpdate={handleUpdateSiteConfig} 
                />
                
                <OssConfigSection 
                    config={siteConfig} 
                    onUpdate={handleUpdateSiteConfig}
                    onTestConnection={testOssConnection}
                    testResult={ossTestResult}
                    isTesting={testingOss}
                />

                <LocalStorageSection 
                  config={{
                    storageType: siteConfig.storageType,
                    localStoragePath: siteConfig.localStoragePath,
                  }}
                  onUpdate={handleUpdateSiteConfig}
                  onTestConnection={testLocalConnection}
                  testResult={localTestResult}
                  isTesting={testingLocal}
                />

                <ApiTokenSection />
            </div>
        </div>

        {/* Global Toast Message */}
        {message && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div
              className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium shadow-lg ${
                message.type === 'success'
                  ? 'bg-green-500 text-white shadow-green-500/20'
                  : 'bg-red-500 text-white shadow-red-500/20'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" />
              )}
              {message.text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
