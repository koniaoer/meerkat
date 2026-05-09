import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Space } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { login, register } from '../services/api';
import { useLanguage } from '../services/i18n';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

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
        navigate('/');
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || t('failed');
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Card style={{ width: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', borderRadius: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ marginBottom: 4 }}>Meerkat</Title>
          <Text type="secondary">{t('systemTitle')}</Text>
        </div>

        <Form form={form} onFinish={handleSubmit} size="large">
          <Form.Item name="username" rules={[{ required: true, message: t('usernameRequired') }]}>
            <Input prefix={<UserOutlined />} placeholder={t('username')} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: t('passwordRequired') }]}>
            <Input.Password prefix={<LockOutlined />} placeholder={t('password')} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              {isRegister ? t('register') : t('login')}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <Space>
            <Text type="secondary">
              {isRegister ? t('hasAccount') : t('noAccount')}
            </Text>
            <Button type="link" onClick={() => { setIsRegister(!isRegister); form.resetFields(); }}>
              {isRegister ? t('login') : t('register')}
            </Button>
          </Space>
        </div>

        {!isRegister && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('firstTimeHint')}</Text>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Login;
