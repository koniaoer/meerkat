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
  // ...
  webhookUrl: { zh: 'Webhook 地址', en: 'Webhook URL' },
  secret: { zh: '加签密钥 (Secret)', en: 'Secret' },
  dingtalkConfig: { zh: '钉钉机器人配置', en: 'DingTalk Bot Config' },
  addConfig: { zh: '新增配置', en: 'Add Config' },
  editConfig: { zh: '编辑配置', en: 'Edit Config' },
  testDingTalk: { zh: '测试推送', en: 'Test Push' },
};  // Overview
  activeAlerts: { zh: '活跃告警', en: 'Active Alerts' },
  activeModel: { zh: '当前激活模型', en: 'Active Model' },
  totalAlerts: { zh: '累计处理告警', en: 'Total Alerts Processed' },
  noActiveModel: { zh: '暂无激活模型', en: 'No Active Model' },
  // Dashboard
  alertName: { zh: '告警名称', en: 'Alert Name' },
  status: { zh: '状态', en: 'Status' },
  severity: { zh: '级别', en: 'Severity' },
  analysis: { zh: 'AI 分析', en: 'AI Analysis' },
  time: { zh: '时间', en: 'Time' },
  waiting: { zh: '正在分析中...', en: 'Analyzing...' },
  // Model Config
  addModel: { zh: '新增模型', en: 'Add Model' },
  editModel: { zh: '编辑模型', en: 'Edit Model' },
  provider: { zh: '提供商', en: 'Provider' },
  modelName: { zh: '模型名称', en: 'Model Name' },
  baseUrl: { zh: 'API 地址', en: 'Base URL' },
  apiKey: { zh: 'API 密钥', en: 'API Key' },
  isActive: { zh: '设为激活', en: 'Set Active' },
  actions: { zh: '操作', en: 'Actions' },
  delete: { zh: '删除', en: 'Delete' },
  deleteConfirm: { zh: '确定删除该配置吗？', en: 'Are you sure to delete this config?' },
  save: { zh: '保存', en: 'Save' },
  success: { zh: '操作成功', en: 'Success' },
  failed: { zh: '操作失败', en: 'Failed' },
  testModel: { zh: '测试模型', en: 'Test Model' },
  testing: { zh: '正在测试...', en: 'Testing...' },
  testSuccess: { zh: '测试连接成功！', en: 'Connection Successful!' },
  testFailed: { zh: '测试连接失败', en: 'Connection Failed' },
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
