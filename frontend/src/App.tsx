import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Button, Space } from 'antd';
import { DashboardOutlined, SettingOutlined, HomeOutlined, TranslationOutlined, MessageOutlined, BellOutlined, LogoutOutlined, ThunderboltOutlined } from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import ModelConfigPage from './pages/ModelConfig';
import DingTalkConfigPage from './pages/DingTalkConfig';
import Overview from './pages/Overview';
import Login from './pages/Login';
import AlertDetail from './pages/AlertDetail';
import NotificationChannels from './pages/NotificationChannels';
import RemediationActions from './pages/RemediationActions';
import { LanguageProvider, useLanguage } from './services/i18n';
import { useEffect, useState } from 'react';
import { getMe, getAlertStats } from './services/api';

const { Header, Content, Sider } = Layout;

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [requireAuth, setRequireAuth] = useState(false);

  // Check auth on startup
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          await getMe();
          setIsLoggedIn(true);
        } catch {
          // Token invalid, check if auth is required
          localStorage.removeItem('token');
          setIsLoggedIn(false);
        }
      }

      // Check if auth is required by trying a public endpoint
      if (!token || !isLoggedIn) {
        try {
          await getAlertStats();
          // Public endpoint works → auth not required
          setRequireAuth(false);
          setIsLoggedIn(true); // treat as logged in
        } catch (e: any) {
          if (e.response?.status === 401) {
            setRequireAuth(true);
          } else {
            // Other error (network, etc.) — don't block
            setRequireAuth(false);
            setIsLoggedIn(true);
          }
        }
      }
      setAuthChecked(true);
    };
    checkAuth();
  }, []);

  // Listen for auth-change events (from Login.tsx, logout, or 401 interceptor)
  useEffect(() => {
    const handleAuthChange = () => {
      setIsLoggedIn(!!localStorage.getItem('token'));
    };
    window.addEventListener('storage', handleAuthChange);
    window.addEventListener('auth-change', handleAuthChange);
    return () => {
      window.removeEventListener('storage', handleAuthChange);
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, []);

  // Redirect to login only if auth is required and user is not logged in
  useEffect(() => {
    if (authChecked && requireAuth && !isLoggedIn && location.pathname !== '/login') {
      navigate('/login');
    }
  }, [authChecked, requireAuth, isLoggedIn, location.pathname, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('auth-change'));
    navigate('/login');
  };

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
      key: '/notification-channels',
      icon: <BellOutlined />,
      label: <Link to="/notification-channels">{t('notificationChannels')}</Link>,
    },
    {
      key: '/remediation-actions',
      icon: <ThunderboltOutlined />,
      label: <Link to="/remediation-actions">{t('aiAutoOps')}</Link>,
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

  // Show loading while checking auth
  if (!authChecked) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Loading...</div>;
  }

  // Login page has no layout
  if (location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
  }

  // Require auth but not logged in → show login
  if (requireAuth && !isLoggedIn) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible>
        <div className="logo" style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', textAlign: 'center', color: 'white', lineHeight: '32px' }}>
          Meerkat Admin
        </div>
        <Menu
          theme="dark"
          selectedKeys={[location.pathname.startsWith('/alerts/') ? '/alerts' : location.pathname]}
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
            {isLoggedIn && (
              <Button
                type="text"
                icon={<LogoutOutlined />}
                onClick={handleLogout}
              >
                {t('logout')}
              </Button>
            )}
          </Space>
        </Header>
        <Content style={{ margin: '16px' }}>
          <div style={{ padding: 24, minHeight: 360, background: '#fff' }}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/alerts" element={<Dashboard />} />
              <Route path="/alerts/:id" element={<AlertDetail />} />
              <Route path="/notification-channels" element={<NotificationChannels />} />
              <Route path="/config" element={<ModelConfigPage />} />
              <Route path="/dingtalk" element={<DingTalkConfigPage />} />
              <Route path="/remediation-actions" element={<RemediationActions />} />
              <Route path="/login" element={<Login />} />
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
