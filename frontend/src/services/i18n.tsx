import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'zh' | 'en';

interface Translation {
  [key: string]: {
    [key in Language]: string;
  };
}

export const translations: Translation = {
  // Navigation
  dashboard: { zh: '仪表盘', en: 'Dashboard' },
  models: { zh: 'AI 模型', en: 'AI Models' },
  dingtalk: { zh: '钉钉配置', en: 'DingTalk' },
  overview: { zh: '概览', en: 'Overview' },
  notificationChannels: { zh: '通知渠道', en: 'Notification Channels' },
  // ...
  webhookUrl: { zh: 'Webhook 地址', en: 'Webhook URL' },
  secret: { zh: '加签密钥 (Secret)', en: 'Secret' },
  dingtalkConfig: { zh: '钉钉机器人配置', en: 'DingTalk Bot Config' },
  addConfig: { zh: '新增配置', en: 'Add Config' },
  editConfig: { zh: '编辑配置', en: 'Edit Config' },
  testDingTalk: { zh: '测试推送', en: 'Test Push' },
  // Overview
  activeAlerts: { zh: '活跃告警', en: 'Active Alerts' },
  activeModel: { zh: '当前激活模型', en: 'Active Model' },
  totalAlerts: { zh: '累计处理告警', en: 'Total Alerts Processed' },
  noActiveModel: { zh: '暂无激活模型', en: 'No Active Model' },
  firingAlerts: { zh: '活跃告警', en: 'Firing Alerts' },
  resolvedAlerts: { zh: '已恢复告警', en: 'Resolved Alerts' },
  acknowledgedAlerts: { zh: '已确认告警', en: 'Acknowledged Alerts' },
  severityBreakdown: { zh: '级别分布', en: 'Severity Breakdown' },
  activeChannels: { zh: '活跃通知渠道', en: 'Active Notification Channels' },
  // Dashboard
  alertName: { zh: '告警名称', en: 'Alert Name' },
  status: { zh: '状态', en: 'Status' },
  severity: { zh: '级别', en: 'Severity' },
  analysis: { zh: 'AI 分析', en: 'AI Analysis' },
  analysisSummary: { zh: 'AI摘要', en: 'AI Summary' },
  time: { zh: '时间', en: 'Time' },
  waiting: { zh: '正在分析中...', en: 'Analyzing...' },
  acknowledged: { zh: '已确认', en: 'Acknowledged' },
  actions: { zh: '操作', en: 'Actions' },
  acknowledge: { zh: '确认', en: 'Acknowledge' },
  silence: { zh: '静默', en: 'Silence' },
  yes: { zh: '是', en: 'Yes' },
  no: { zh: '否', en: 'No' },
  // Filter
  statusFilter: { zh: '状态筛选', en: 'Status Filter' },
  severityFilter: { zh: '级别筛选', en: 'Severity Filter' },
  acknowledgedFilter: { zh: '确认筛选', en: 'Acknowledged Filter' },
  firing: { zh: '活跃', en: 'Firing' },
  resolved: { zh: '已恢复', en: 'Resolved' },
  critical: { zh: '严重', en: 'Critical' },
  high: { zh: '高', en: 'High' },
  warning: { zh: '警告', en: 'Warning' },
  medium: { zh: '中', en: 'Medium' },
  low: { zh: '低', en: 'Low' },
  info: { zh: '信息', en: 'Info' },
  // Alert Detail
  back: { zh: '返回', en: 'Back' },
  fingerprint: { zh: '指纹', en: 'Fingerprint' },
  silenced: { zh: '已静默', en: 'Silenced' },
  aiAnalysis: { zh: 'AI 分析', en: 'AI Analysis' },
  summary: { zh: '摘要', en: 'Summary' },
  rootCause: { zh: '根因分析', en: 'Root Cause' },
  suggestion: { zh: '建议措施', en: 'Suggestion' },
  silence2h: { zh: '静默 2 小时', en: 'Silence 2h' },
  rawData: { zh: '原始数据', en: 'Raw Data' },
  alertNotFound: { zh: '告警未找到', en: 'Alert Not Found' },
  // Model Config
  addModel: { zh: '新增模型', en: 'Add Model' },
  editModel: { zh: '编辑模型', en: 'Edit Model' },
  provider: { zh: '提供商', en: 'Provider' },
  modelName: { zh: '模型名称', en: 'Model Name' },
  baseUrl: { zh: 'API 地址', en: 'Base URL' },
  apiKey: { zh: 'API 密钥', en: 'API Key' },
  isActive: { zh: '设为激活', en: 'Set Active' },
  delete: { zh: '删除', en: 'Delete' },
  deleteConfirm: { zh: '确定删除该配置吗？', en: 'Are you sure to delete this config?' },
  save: { zh: '保存', en: 'Save' },
  success: { zh: '操作成功', en: 'Success' },
  failed: { zh: '操作失败', en: 'Failed' },
  testModel: { zh: '测试模型', en: 'Test Model' },
  testing: { zh: '正在测试...', en: 'Testing...' },
  testSuccess: { zh: '测试连接成功！', en: 'Connection Successful!' },
  testFailed: { zh: '测试连接失败', en: 'Connection Failed' },
  // Auth / Login
  systemTitle: { zh: 'Prometheus 告警分析系统', en: 'Prometheus Alert Analysis System' },
  username: { zh: '用户名', en: 'Username' },
  password: { zh: '密码', en: 'Password' },
  login: { zh: '登录', en: 'Login' },
  register: { zh: '注册', en: 'Register' },
  loginSuccess: { zh: '登录成功', en: 'Login Successful' },
  registerSuccess: { zh: '注册成功，请登录', en: 'Registration successful, please login' },
  usernameRequired: { zh: '请输入用户名', en: 'Please enter username' },
  passwordRequired: { zh: '请输入密码', en: 'Please enter password' },
  hasAccount: { zh: '已有账号？', en: 'Already have an account?' },
  noAccount: { zh: '没有账号？', en: "Don't have an account?" },
  firstTimeHint: { zh: '首次使用，请注册', en: 'First time? Please register' },
  logout: { zh: '退出登录', en: 'Logout' },
  // Notification Channels
  channelName: { zh: '渠道名称', en: 'Channel Name' },
  channelNamePlaceholder: { zh: '输入渠道名称', en: 'Enter channel name' },
  channelType: { zh: '渠道类型', en: 'Channel Type' },
  addChannel: { zh: '新增渠道', en: 'Add Channel' },
  editChannel: { zh: '编辑渠道', en: 'Edit Channel' },
  dingtalkChannel: { zh: '钉钉', en: 'DingTalk' },
  wecomChannel: { zh: '企业微信', en: 'WeCom' },
  slackChannel: { zh: 'Slack', en: 'Slack' },
  emailChannel: { zh: '邮件', en: 'Email' },
  webhookChannel: { zh: '自定义Webhook', en: 'Custom Webhook' },
  active: { zh: '已启用', en: 'Active' },
  inactive: { zh: '已禁用', en: 'Inactive' },
  testPush: { zh: '测试推送', en: 'Test Push' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('zh');

  const t = (key: string) => {
    return translations[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
