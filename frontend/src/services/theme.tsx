import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { theme as antTheme } from 'antd';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  algorithm: any;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'meerkat-theme';

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  useEffect(() => {
    localStorage.setItem(THEME_KEY, themeMode);
    document.body.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  const toggleTheme = () => {
    const next = themeMode === 'light' ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, next);
    // 刷新页面让 antd CSS-in-JS 重新生成样式
    window.location.reload();
  };

  const algorithm = themeMode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm;

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, toggleTheme, algorithm }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
