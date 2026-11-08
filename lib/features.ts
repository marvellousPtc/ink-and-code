/**
 * 站点功能开关
 *
 * AI 对话（悬浮助手 / 首页对话入口 / /api/chat 接口）默认关闭。
 * 需要恢复时：在 .env 中设置 AI_CHAT_ENABLED=true 后重启服务即可，
 * 页面与接口会自动重新开放，无需改代码。
 *
 * 注意：AI 写作动作（/api/ai/writing）与 AI 阅读工具（/api/ai/reading）
 * 属于独立功能，不受此开关影响。
 */

/** 是否开启 AI 对话功能（默认关闭） */
export const AI_CHAT_ENABLED = process.env.AI_CHAT_ENABLED?.trim().toLowerCase() === 'true';
