import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Space } from 'antd';
import { DashboardOutlined, SettingOutlined, HomeOutlined, TranslationOutlined, MessageOutlined } from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import ModelConfigPage from './pages/ModelConfig';
import DingTalkConfigPage from './pages/DingTalkConfig';
import Overview from './pages/Overview';
import { LanguageProvider, useLanguage } from './services/i18n';

const { Header, Content, Sider } = Layout;

const AppContent = () => {
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  
  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: <Link to="/">{t('overview')}</Link>,
    },
    {
      key: '/alerts',
      icon: <DashboardOutlined />,
      label: <Link to="/alerts">{t('dashboard')}</Link>,
    },
    {
      key: '/config',
      icon: <SettingOutlined />,
      label: <Link to="/config">{t('models')}</Link>,
    },
    {
      key: '/dingtalk',
      icon: <MessageOutlined />,
      label: <Link to="/dingtalk">{t('dingtalk')}</Link>,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible>
        <div className="logo" style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', textAlign: 'center', color: 'white', lineHeight: '32px' }}>
          Meerkat Admin
        </div>
        <Menu 
          theme="dark" 
          selectedKeys={[location.pathname]} 
          mode="inline" 
          items={menuItems}
        />
      </Sider>
      <Layout className="site-layout">
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Space>
            <Button 
              type="text" 
              icon={<TranslationOutlined />} 
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            >
              {language === 'zh' ? 'English' : '中文'}
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: '16px' }}>
          <div style={{ padding: 24, minHeight: 360, background: '#fff' }}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/alerts" element={<Dashboard />} />
              <Route path="/config" element={<ModelConfigPage />} />
              <Route path="/dingtalk" element={<DingTalkConfigPage />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

function App() {
  return (
    <LanguageProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppContent />
      </Router>
    </LanguageProvider>
  );
}

export default App;
