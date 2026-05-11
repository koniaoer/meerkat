import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Layout, Menu, Button, Space, Spin, Tooltip } from 'antd';
import {
  DashboardOutlined, SettingOutlined, HomeOutlined,
  TranslationOutlined, BellOutlined, LogoutOutlined,
  ThunderboltOutlined, UserOutlined, BulbOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
  SafetyOutlined, FileSearchOutlined,
  TeamOutlined, RiseOutlined,
  ToolOutlined,
  BookOutlined, MessageOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import ModelConfigPage from './pages/ModelConfig';
import Overview from './pages/Overview';
import Login from './pages/Login';
import AlertDetail from './pages/AlertDetail';
import NotificationChannels from './pages/NotificationChannels';
import RemediationActions from './pages/RemediationActions';
import AlertRules from './pages/AlertRules';
import MonitorDashboard from './pages/MonitorDashboard';
import AuditLog from './pages/AuditLog';
import OnCallSchedule from './pages/OnCallSchedule';
import EscalationPolicyPage from './pages/EscalationPolicy';
import RemediationTemplates from './pages/RemediationTemplates';
import KnowledgeBase from './pages/KnowledgeBase';
import ChatOps from './pages/ChatOps';
import UserManagement from './pages/UserManagement';
import { LanguageProvider, useLanguage } from './services/i18n';
import { ThemeProvider, useTheme } from './services/theme';
import { useEffect, useState } from 'react';
import { getMe } from './services/api';

const { Header, Content } = Layout;

type AuthState = 'checking' | 'authenticated' | 'no_auth' | 'unauthenticated';

const SIDER_EXPANDED = 220;
const SIDER_COLLAPSED = 64;

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const { themeMode, toggleTheme } = useTheme();
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [userRole, setUserRole] = useState<string>('viewer');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const meRes = await getMe();
          setUserRole(meRes.data.role || 'viewer');
          setAuthState('authenticated');
          return;
        } catch { localStorage.removeItem('token'); }
      }
      try {
        await getMe();
        setAuthState('no_auth');
      } catch (e: any) {
        setAuthState(e.response?.status === 401 ? 'unauthenticated' : 'no_auth');
      }
    };
    checkAuth();
  }, []);

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

  const isDark = themeMode === 'dark';
  const siderWidth = collapsed ? SIDER_COLLAPSED : SIDER_EXPANDED;

  // 侧边栏背景：洛天依蓝深色调
  const siderBg = isDark
    ? 'linear-gradient(180deg, #0a1628 0%, #0f1d32 100%)'
    : 'linear-gradient(180deg, #0a2a4a 0%, #0e3a5e 50%, #0f3d64 100%)';

  const menuItems = [
    { key: '/', icon: <HomeOutlined />, label: <Link to="/">{t('overview')}</Link> },
    { key: '/alerts', icon: <DashboardOutlined />, label: <Link to="/alerts">{t('dashboard')}</Link> },
    { key: '/notification-channels', icon: <BellOutlined />, label: <Link to="/notification-channels">{t('notificationChannels')}</Link> },
    { key: '/remediation-actions', icon: <ThunderboltOutlined />, label: <Link to="/remediation-actions">{t('aiAutoOps')}</Link> },
    { key: '/remediation-templates', icon: <ToolOutlined />, label: <Link to="/remediation-templates">{t('remediationTemplates')}</Link> },
    { key: '/knowledge', icon: <BookOutlined />, label: <Link to="/knowledge">{t('knowledgeBase')}</Link> },
    { key: '/chatops', icon: <MessageOutlined />, label: <Link to="/chatops">{t('chatops')}</Link> },
    { key: '/monitor', icon: <LineChartOutlined />, label: <Link to="/monitor">{t('monitorDashboard')}</Link> },
    { key: '/alert-rules', icon: <SafetyOutlined />, label: <Link to="/alert-rules">{t('alertRules')}</Link> },
    { key: '/oncall', icon: <TeamOutlined />, label: <Link to="/oncall">{t('oncallSchedule')}</Link> },
    { key: '/escalation', icon: <RiseOutlined />, label: <Link to="/escalation">{t('escalationPolicy')}</Link> },
    ...(userRole === 'admin' ? [
      { key: '/audit-log', icon: <FileSearchOutlined />, label: <Link to="/audit-log">{t('auditLog')}</Link> },
      { key: '/users', icon: <UserOutlined />, label: <Link to="/users">{t('userManagement')}</Link> },
    ] : []),
    { key: '/config', icon: <SettingOutlined />, label: <Link to="/config">{t('models')}</Link> },
  ];

  if (authState === 'checking') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (authState === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="meerkat" style={{ minHeight: '100vh' }}>
      {/* ─── 侧边栏：width 动画 + overflow:hidden 裁剪 ─── */}
      <div
        className="meerkat-sider"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width: siderWidth,
          zIndex: 100,
          background: siderBg,
          overflow: 'hidden',
          transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
        }}
      >
        {/* Logo */}
        <div style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          borderBottom: '1px solid rgba(102, 204, 255, 0.12)',
          gap: 10,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #66CCFF 0%, #3399CC 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(102, 204, 255, 0.4)',
          }}>
            M
          </div>
          <span style={{
            color: '#fff',
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: '0.5px',
            opacity: collapsed ? 0 : 1,
            transition: 'opacity 0.2s ease',
          }}>
            Meerkat
          </span>
        </div>

        {/* Menu: collapsed 时 antd 会自动只显示 icon */}
        <Menu
          theme="dark"
          selectedKeys={[location.pathname.startsWith('/alerts/') ? '/alerts' : location.pathname]}
          mode="inline"
          inlineCollapsed={collapsed}
          items={menuItems}
          style={{
            borderRight: 0,
            marginTop: 4,
            background: 'transparent',
          }}
        />

        {/* 底部折叠按钮 */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '8px 0',
          borderTop: '1px solid rgba(102, 204, 255, 0.12)',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              color: 'rgba(102, 204, 255, 0.7)',
              fontSize: 16,
            }}
          />
        </div>
      </div>

      {/* ─── 主内容区 ─── */}
      <div style={{
        marginLeft: siderWidth,
        minHeight: '100vh',
        transition: 'margin-left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <Header style={{
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
          height: 56,
          lineHeight: '56px',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f0f0f0',
          background: isDark ? '#112240' : '#fff',
        }}>
          <Space size={4}>
            <Tooltip title={isDark ? t('switchToLight') : t('switchToDark')}>
              <Button
                type="text"
                icon={<BulbOutlined />}
                onClick={toggleTheme}
                style={{ color: isDark ? '#66CCFF' : '#4DB8E8' }}
              />
            </Tooltip>
            <Button
              type="text"
              icon={<TranslationOutlined />}
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            >
              {language === 'zh' ? 'EN' : '中'}
            </Button>
            {authState === 'authenticated' && (
              <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
                {t('logout')}
              </Button>
            )}
          </Space>
        </Header>
        <Content style={{ margin: 16, background: 'transparent' }}>
          <div style={{ padding: 24, minHeight: 360, borderRadius: 8, background: 'var(--ant-color-bg-container)' }}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/alerts" element={<Dashboard />} />
              <Route path="/alerts/:id" element={<AlertDetail />} />
              <Route path="/notification-channels" element={<NotificationChannels />} />
              <Route path="/remediation-actions" element={<RemediationActions />} />
              <Route path="/remediation-templates" element={<RemediationTemplates />} />
              <Route path="/knowledge" element={<KnowledgeBase />} />
              <Route path="/chatops" element={<ChatOps />} />
              <Route path="/monitor" element={<MonitorDashboard />} />
              <Route path="/alert-rules" element={<AlertRules />} />
              <Route path="/oncall" element={<OnCallSchedule />} />
              <Route path="/escalation" element={<EscalationPolicyPage />} />
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/config" element={<ModelConfigPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Content>
      </div>
    </div>
  );
};

function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppContent />
        </Router>
      </ThemeProvider>
    </LanguageProvider>
  );
}

export default App;
