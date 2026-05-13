import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Space, Tooltip, Divider } from 'antd';
import { UserOutlined, LockOutlined, BulbOutlined, TranslationOutlined } from '@ant-design/icons';
import { login, register } from '../services/api';
import { useLanguage } from '../services/i18n';
import { useTheme } from '../services/theme';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const { t } = useLanguage();
  const { language, setLanguage, themeMode, toggleTheme } = useTheme();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const isDark = themeMode === 'dark';

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      if (isRegister) {
        await register(values);
        message.success(t('registerSuccess'));
        setIsRegister(false);
        form.resetFields();
      } else {
        const res = await login(values);
        const { access_token, role, display_name } = res.data;
        localStorage.setItem('token', access_token);
        localStorage.setItem('userRole', role || 'viewer');
        localStorage.setItem('displayName', display_name || '');
        window.dispatchEvent(new Event('auth-change'));
        message.success(t('loginSuccess'));
        // Don't navigate('/') here — auth-change will update authState,
        // and App.tsx will auto-navigate away from /login when authState = 'authenticated'
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || t('loginFailed');
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg" style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      position: 'relative',
      padding: 24,
    }}>
      {/* ─── 右上角：主题 + 语言切换 ─── */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 24,
        display: 'flex',
        gap: 4,
        zIndex: 10,
      }}>
        <Tooltip title={isDark ? t('switchToLight') : t('switchToDark')}>
          <Button
            type="text"
            shape="circle"
            icon={<BulbOutlined />}
            onClick={toggleTheme}
            style={{
              color: isDark ? 'rgba(102,204,255,0.8)' : 'rgba(77,184,232,0.9)',
              background: isDark ? 'rgba(102,204,255,0.08)' : 'rgba(102,204,255,0.06)',
              backdropFilter: 'blur(8px)',
            }}
          />
        </Tooltip>
        <Button
          type="text"
          shape="circle"
          onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
          style={{
            color: isDark ? 'rgba(102,204,255,0.8)' : 'rgba(77,184,232,0.9)',
            background: isDark ? 'rgba(102,204,255,0.08)' : 'rgba(102,204,255,0.06)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {language === 'zh' ? 'EN' : '中'}
        </Button>
      </div>

      {/* ─── 登录卡片 ─── */}
      <Card
        style={{
          width: 420,
          maxWidth: '100%',
          borderRadius: 16,
          border: isDark ? '1px solid rgba(102,204,255,0.12)' : '1px solid rgba(0,0,0,0.06)',
          background: isDark
            ? 'linear-gradient(145deg, rgba(17,34,64,0.92) 0%, rgba(13,27,42,0.95) 100%)'
            : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(20px)',
          boxShadow: isDark
            ? '0 8px 32px rgba(0,0,0,0.4), 0 0 80px rgba(102,204,255,0.06)'
            : '0 8px 32px rgba(0,0,0,0.08), 0 0 80px rgba(102,204,255,0.04)',
          transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        styles={{ body: { padding: '36px 32px 28px' } }}
      >
        {/* Logo + 标题 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #66CCFF 0%, #3399CC 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            fontWeight: 700,
            color: '#fff',
            marginBottom: 16,
            boxShadow: '0 4px 16px rgba(102,204,255,0.35)',
          }}>
            M
          </div>
          <Title level={3} style={{
            marginBottom: 4,
            color: isDark ? '#e0eaf5' : undefined,
            fontWeight: 600,
          }}>
            Meerkat
          </Title>
          <Text style={{
            color: isDark ? 'rgba(136,153,170,0.9)' : undefined,
            fontSize: 14,
          }}>
            {t('systemTitle')}
          </Text>
        </div>

        {/* 表单 */}
        <Form form={form} onFinish={handleSubmit} size="large">
          <Form.Item name="username" rules={[{ required: true, message: t('usernameRequired') }]}>
            <Input
              prefix={<UserOutlined style={{ color: isDark ? '#5a7a9a' : '#bfbfbf' }} />}
              placeholder={t('username')}
              style={{
                background: isDark ? 'rgba(13,27,42,0.6)' : undefined,
                borderColor: isDark ? '#1e3a5f' : undefined,
              }}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: t('passwordRequired') }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: isDark ? '#5a7a9a' : '#bfbfbf' }} />}
              placeholder={t('password')}
              style={{
                background: isDark ? 'rgba(13,27,42,0.6)' : undefined,
                borderColor: isDark ? '#1e3a5f' : undefined,
              }}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 44,
                borderRadius: 10,
                fontWeight: 500,
                fontSize: 15,
                background: 'linear-gradient(135deg, #66CCFF 0%, #4DB8E8 100%)',
                border: 'none',
                boxShadow: isDark
                  ? '0 4px 16px rgba(102,204,255,0.25)'
                  : '0 4px 12px rgba(102,204,255,0.3)',
              }}
            >
              {isRegister ? t('register') : t('login')}
            </Button>
          </Form.Item>
        </Form>

        {/* 注册/登录切换 */}
        <div style={{ textAlign: 'center' }}>
          <Space size={4}>
            <Text style={{ color: isDark ? 'rgba(136,153,170,0.8)' : undefined, fontSize: 13 }}>
              {isRegister ? t('hasAccount') : t('noAccount')}
            </Text>
            <Button
              type="link"
              onClick={() => { setIsRegister(!isRegister); form.resetFields(); }}
              style={{ color: isDark ? '#66CCFF' : '#4DB8E8', padding: 0, fontSize: 13 }}
            >
              {isRegister ? t('login') : t('register')}
            </Button>
          </Space>
        </div>

        {/* 首次提示 */}
        {!isRegister && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Text style={{ color: isDark ? 'rgba(90,122,154,0.8)' : undefined, fontSize: 12 }}>
              {t('firstTimeHint')}
            </Text>
          </div>
        )}

        {/* 底部分割线 + 主题提示 */}
        <Divider style={{
          margin: '20px 0 12px',
          borderColor: isDark ? 'rgba(102,204,255,0.08)' : 'rgba(0,0,0,0.06)',
        }} />
        <div style={{ textAlign: 'center' }}>
          <Text style={{ color: isDark ? 'rgba(90,122,154,0.6)' : 'rgba(0,0,0,0.25)', fontSize: 11 }}>
            {isDark ? '🌙 Dark Mode' : '☀️ Light Mode'}  ·  Meerkat AI Ops
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default Login;
