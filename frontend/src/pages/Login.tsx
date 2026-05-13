import React, { useState, useEffect } from 'react';
import { Form, Input, Button, message, Space, Tooltip } from 'antd';
import { UserOutlined, LockOutlined, BulbOutlined, GithubOutlined } from '@ant-design/icons';
import { login, register } from '../services/api';
import { useLanguage } from '../services/i18n';
import { useTheme } from '../services/theme';

const Login: React.FC = () => {
  const { t } = useLanguage();
  const { language, setLanguage, themeMode, toggleTheme } = useTheme();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const isDark = themeMode === 'dark';

  // Particle animation — floating dots on login background
  const [particles] = useState(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * -20,
      opacity: Math.random() * 0.4 + 0.1,
    }))
  );

  useEffect(() => {
    // Add particle keyframes if not already present
    if (!document.getElementById('login-particles-style')) {
      const style = document.createElement('style');
      style.id = 'login-particles-style';
      style.textContent = `
        @keyframes login-float {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: var(--p-opa, 0.2); }
          25% { transform: translateY(-30px) translateX(10px); opacity: calc(var(--p-opa, 0.2) * 1.5); }
          50% { transform: translateY(-10px) translateX(-15px); opacity: var(--p-opa, 0.2); }
          75% { transform: translateY(-40px) translateX(5px); opacity: calc(var(--p-opa, 0.2) * 0.6); }
        }
        @keyframes login-pulse-ring {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 0.2; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
        @keyframes login-card-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        .login-card-wrapper {
          animation: login-card-float 6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .login-card-wrapper,
          .login-particle,
          .login-logo-ring { animation: none !important; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

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
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || t('loginFailed');
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const GIT_URL = 'https://github.com/koniaoer/meerkat';

  return (
    <div className="login-bg" style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      position: 'relative',
      padding: 24,
      overflow: 'hidden',
    }}>
      {/* ─── 浮动粒子背景 ─── */}
      {particles.map(p => (
        <div
          key={p.id}
          className="login-particle"
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: isDark ? `rgba(102,204,255,${p.opacity})` : `rgba(77,184,232,${p.opacity * 0.6})`,
            '--p-opa': p.opacity,
            animation: `login-float ${p.duration}s ease-in-out ${p.delay}s infinite`,
            pointerEvents: 'none',
          } as React.CSSProperties}
        />
      ))}

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
      <div className="login-card-wrapper" style={{ width: 440, maxWidth: '100%' }}>
        <div style={{
          borderRadius: 20,
          border: isDark ? '1px solid rgba(102,204,255,0.1)' : '1px solid rgba(0,0,0,0.04)',
          background: isDark
            ? 'linear-gradient(160deg, rgba(17,34,64,0.88) 0%, rgba(13,27,42,0.92) 50%, rgba(10,22,40,0.9) 100%)'
            : 'rgba(255,255,255,0.78)',
          backdropFilter: 'blur(24px) saturate(1.2)',
          boxShadow: isDark
            ? '0 12px 48px rgba(0,0,0,0.5), 0 0 120px rgba(102,204,255,0.04), inset 0 1px 0 rgba(102,204,255,0.06)'
            : '0 12px 48px rgba(0,0,0,0.06), 0 0 80px rgba(102,204,255,0.03), inset 0 1px 0 rgba(255,255,255,0.8)',
          transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          padding: '44px 36px 32px',
        }}>
          {/* Logo + 标题 */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            {/* Logo with animated ring */}
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 20 }}>
              {/* Pulsing ring */}
              <div
                className="login-logo-ring"
                style={{
                  position: 'absolute',
                  inset: -6,
                  borderRadius: 22,
                  border: `1.5px solid ${isDark ? 'rgba(102,204,255,0.2)' : 'rgba(77,184,232,0.15)'}`,
                  animation: 'login-pulse-ring 3s ease-in-out infinite',
                }}
              />
              <div style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                background: 'linear-gradient(135deg, #66CCFF 0%, #3399CC 50%, #2277AA 100%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                fontWeight: 700,
                color: '#fff',
                boxShadow: isDark
                  ? '0 4px 20px rgba(102,204,255,0.3), inset 0 1px 0 rgba(255,255,255,0.15)'
                  : '0 4px 16px rgba(102,204,255,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                position: 'relative',
              }}>
                M
              </div>
            </div>

            {/* Title with gradient text */}
            <div style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '1px',
              background: isDark
                ? 'linear-gradient(135deg, #66CCFF 0%, #e0eaf5 50%, #66CCFF 100%)'
                : 'linear-gradient(135deg, #2277AA 0%, #3399CC 50%, #2277AA 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: 6,
            }}>
              Meerkat
            </div>

            <div style={{
              fontSize: 13,
              color: isDark ? 'rgba(136,153,170,0.85)' : 'rgba(77,120,160,0.7)',
              fontWeight: 400,
              letterSpacing: '0.5px',
            }}>
              {t('systemTitle')}
            </div>
          </div>

          {/* 表单 */}
          <Form form={form} onFinish={handleSubmit} size="large">
            <Form.Item name="username" rules={[{ required: true, message: t('usernameRequired') }]}>
              <Input
                prefix={<UserOutlined style={{ color: isDark ? '#5a7a9a' : '#bfbfbf' }} />}
                placeholder={t('username')}
                style={{
                  background: isDark ? 'rgba(13,27,42,0.5)' : 'rgba(240,245,250,0.6)',
                  borderColor: isDark ? '#1e3a5f' : 'rgba(77,184,232,0.2)',
                  borderRadius: 10,
                  height: 44,
                  transition: 'all 0.3s ease',
                }}
              />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: t('passwordRequired') }]}>
              <Input.Password
                prefix={<LockOutlined style={{ color: isDark ? '#5a7a9a' : '#bfbfbf' }} />}
                placeholder={t('password')}
                style={{
                  background: isDark ? 'rgba(13,27,42,0.5)' : 'rgba(240,245,250,0.6)',
                  borderColor: isDark ? '#1e3a5f' : 'rgba(77,184,232,0.2)',
                  borderRadius: 10,
                  height: 44,
                  transition: 'all 0.3s ease',
                }}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 16, marginTop: 4 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{
                  height: 46,
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 15,
                  background: 'linear-gradient(135deg, #66CCFF 0%, #4DB8E8 50%, #3399CC 100%)',
                  border: 'none',
                  boxShadow: isDark
                    ? '0 4px 20px rgba(102,204,255,0.25)'
                    : '0 4px 16px rgba(102,204,255,0.3)',
                  transition: 'all 0.3s ease',
                }}
              >
                {isRegister ? t('register') : t('login')}
              </Button>
            </Form.Item>
          </Form>

          {/* 注册/登录切换 */}
          <div style={{ textAlign: 'center' }}>
            <Space size={4}>
              <span style={{ color: isDark ? 'rgba(136,153,170,0.7)' : 'rgba(77,120,160,0.6)', fontSize: 13 }}>
                {isRegister ? t('hasAccount') : t('noAccount')}
              </span>
              <Button
                type="link"
                onClick={() => { setIsRegister(!isRegister); form.resetFields(); }}
                style={{ color: isDark ? '#66CCFF' : '#4DB8E8', padding: 0, fontSize: 13, fontWeight: 500 }}
              >
                {isRegister ? t('login') : t('register')}
              </Button>
            </Space>
          </div>

          {/* 首次提示 */}
          {!isRegister && (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <span style={{ color: isDark ? 'rgba(90,122,154,0.6)' : 'rgba(77,120,160,0.45)', fontSize: 12 }}>
                {t('firstTimeHint')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ─── 底部 Git 地址 ─── */}
      <div style={{
        marginTop: 28,
        textAlign: 'center',
        zIndex: 2,
      }}>
        <a
          href={GIT_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: isDark ? 'rgba(102,204,255,0.5)' : 'rgba(77,120,160,0.4)',
            fontSize: 12,
            textDecoration: 'none',
            transition: 'color 0.3s ease',
            letterSpacing: '0.3px',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = isDark ? 'rgba(102,204,255,0.8)' : 'rgba(51,153,204,0.7)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = isDark ? 'rgba(102,204,255,0.5)' : 'rgba(77,120,160,0.4)';
          }}
        >
          <GithubOutlined style={{ fontSize: 14 }} />
          {GIT_URL}
        </a>
        <div style={{
          marginTop: 6,
          color: isDark ? 'rgba(90,122,154,0.35)' : 'rgba(77,120,160,0.25)',
          fontSize: 11,
        }}>
          {isDark ? '🌙' : '☀️'} Meerkat AI Ops · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
};

export default Login;
