import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ConfigProvider, theme as antTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { ThemeProvider, useTheme } from './services/theme'
import { LanguageProvider, useLanguage } from './services/i18n'

// 洛天依蓝 #66CCFF
const LUOTIANYI_BLUE = '#66CCFF';
const LUOTIANYI_BLUE_DARK = '#4DB8E8';

const RootApp = () => {
  const { themeMode, algorithm } = useTheme();
  const { language } = useLanguage();
  const isDark = themeMode === 'dark';

  return (
    <ConfigProvider
      locale={language === 'zh' ? zhCN : enUS}
      theme={{
        cssVar: { key: 'meerkat' },
        algorithm,
        token: {
          borderRadius: 8,
          colorPrimary: isDark ? LUOTIANYI_BLUE_DARK : LUOTIANYI_BLUE,
          colorLink: isDark ? LUOTIANYI_BLUE_DARK : LUOTIANYI_BLUE,
          colorLinkHover: '#8DD8FF',
          ...(isDark ? {
            colorBgBase: '#0d1b2a',
            colorBgContainer: '#112240',
            colorBgElevated: '#1a2d4a',
            colorBgLayout: '#0d1b2a',
            colorBorder: '#1e3a5f',
            colorBorderSecondary: '#162d50',
            colorText: '#c8d6e5',
            colorTextSecondary: '#8899aa',
            colorTextTertiary: '#5a7a9a',
          } : {
            colorBgLayout: '#f0f5fa',
          }),
        },
        components: {
          Menu: {
            itemBorderRadius: 8,
            itemMarginInline: 8,
            ...(isDark ? {
              darkItemBg: 'transparent',
              darkItemColor: '#a0b4cc',
              darkItemHoverBg: 'rgba(77, 184, 232, 0.12)',
              darkItemSelectedBg: 'rgba(77, 184, 232, 0.2)',
              darkItemSelectedColor: '#66CCFF',
            } : {}),
          },
          Card: {
            borderRadius: 10,
            ...(isDark ? {
              colorBgContainer: '#112240',
              colorBorderSecondary: '#1e3a5f',
            } : {}),
          },
          Button: {
            primaryShadow: isDark
              ? '0 2px 0 rgba(77, 184, 232, 0.2)'
              : '0 2px 0 rgba(102, 204, 255, 0.3)',
          },
          Table: {
            ...(isDark ? {
              colorBgContainer: '#112240',
              headerBg: '#162d50',
              rowHoverBg: '#1a3355',
              borderColor: '#1e3a5f',
            } : {}),
          },
          Modal: {
            ...(isDark ? {
              contentBg: '#112240',
              headerBg: '#112240',
            } : {}),
          },
          Input: {
            ...(isDark ? {
              colorBgContainer: '#0d1b2a',
              colorBorder: '#1e3a5f',
            } : {}),
          },
          Select: {
            ...(isDark ? {
              colorBgContainer: '#0d1b2a',
              colorBorder: '#1e3a5f',
              optionSelectedBg: 'rgba(77, 184, 232, 0.2)',
            } : {}),
          },
          Form: {
            ...(isDark ? {
              labelColor: '#8899aa',
            } : {}),
          },
          Statistic: {
            ...(isDark ? {
              titleFontSize: 14,
            } : {}),
          },
          Tag: {
            ...(isDark ? {
              defaultBg: 'rgba(77, 184, 232, 0.1)',
              defaultColor: '#8DD8FF',
            } : {}),
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <RootApp />
      </ThemeProvider>
    </LanguageProvider>
  </React.StrictMode>,
)
