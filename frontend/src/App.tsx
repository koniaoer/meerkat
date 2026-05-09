import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Layout, Menu, Button, Space, Spin } from 'antd';
import { DashboardOutlined, SettingOutlined, HomeOutlined, TranslationOutlined, BellOutlined, LogoutOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import ModelConfigPage from './pages/ModelConfig';
import Overview from './pages/Overview';
import Login from './pages/Login';
import AlertDetail from './pages/AlertDetail';
import NotificationChannels from './pages/NotificationChannels';
import RemediationActions from './pages/RemediationActions';
import UserManagement from './pages/UserManagement';
import { LanguageProvider, useLanguage } from './services/i18n';
import { useEffect, useState, ReactNode } from 'react';
import { getMe } from './services/api';

const { Header, Content, Sider } = Layout;

/** Auth state machine:
 *  - 'checking' : still validating token on startup
 *  - 'authenticated' : valid token, show main app
 *  - 'no_auth' : no users in DB yet (first-time setup), show app without login
 *  - 'unauthenticated' : users exist but no valid token, force login
 */
type AuthState = 'checking' | 'authenticated' | 'no_auth' | 'unauthenticated';

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [userRole, setUserRole] = useState<string>('viewer');

  // Check auth on startup
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const meRes = await getMe();
          setUserRole(meRes.data.role || 'viewer');
          setAuthState('authenticated');
          return;
        } catch (e: any) {
          // Token invalid or expired
          localStorage.removeItem('token');
        }
      }

      // No valid token — try accessing a protected endpoint to determine if auth is required
      try {
        await getMe();  // This will 401 if users exist, 200 if no users
        // Got 200 = no users in DB = first-time setup
        setAuthState('no_auth');
      } catch (e: any) {
        if (e.response?.status === 401) {
          // Users exist, auth required
          setAuthState('unauthenticated');
        } else {
          // Network error — don't block, assume no auth for now
          setAuthState('no_auth');
        }
      }
    };
    checkAuth();
  }, []);

  // Listen for auth-change events (login, logout, 401 interceptor)
  useEffect(() => {
    const handleAuthChange = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const meRes = await getMe();
          setUserRole(meRes.data.role || 'viewer');
          setAuthState('authenticated');
        } catch {
          localStorage.removeItem('token');
          setUserRole('viewer');
          setAuthState('unauthenticated');
        }
      } else {
        setUserRole('viewer');
        setAuthState('unauthenticated');
      }
    };
    window.addEventListener('storage', handleAuthChange);
    window.addEventListener('auth-change', handleAuthChange);
    return () => {
      window.removeEventListener('storage', handleAuthChange);
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, []);

  // Redirect unauthenticated users to login (covers URL bar navigation)
  useEffect(() => {
    if (authState === 'unauthenticated' && location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }
  }, [authState, location.pathname, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('displayName');
    window.dispatchEvent(new Event('auth-change'));
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
    // Admin-only menu items
    ...(userRole === 'admin' ? [{
      key: '/users',
      icon: <UserOutlined />,
      label: <Link to="/users">{t('userManagement')}</Link>,
    }] : []),
    {
      key: '/config',
      icon: <SettingOutlined />,
      label: <Link to="/config">{t('models')}</Link>,
    },
  ];

  // Loading state
  if (authState === 'checking') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  // Login page — always accessible, no layout
  if (location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Unauthenticated — force login, catch ALL routes
  if (authState === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  // Authenticated or no_auth — show main app
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
            {authState === 'authenticated' && (
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
              <Route path="/remediation-actions" element={<RemediationActions />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/config" element={<ModelConfigPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
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
