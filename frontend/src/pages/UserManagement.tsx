import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, Select, Typography, Popconfirm, message, Card, Row, Col, Statistic } from 'antd';
import { UserOutlined, PlusOutlined, DeleteOutlined, EditOutlined, SafetyCertificateOutlined, EyeOutlined } from '@ant-design/icons';
import { getUsers, createUser, updateUser, deleteUser } from '../services/api';
import { useLanguage } from '../services/i18n';

const { Title, Text } = Typography;

const roleColorMap: Record<string, string> = {
  admin: 'red',
  operator: 'blue',
  viewer: 'green',
};

const UserManagement: React.FC = () => {
  const { t } = useLanguage();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await getUsers();
      setUsers(res.data);
    } catch (error: any) {
      if (error.response?.status === 403) {
        message.error(t('permissionDenied'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (user: any) => {
    setEditingUser(user);
    form.setFieldsValue({
      display_name: user.display_name,
      role: user.role,
      is_active: user.is_active,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingUser) {
        // Update
        const updateData: any = {
          display_name: values.display_name,
          role: values.role,
          is_active: values.is_active,
        };
        if (values.password) {
          updateData.password = values.password;
        }
        await updateUser(editingUser.id, updateData);
        message.success(t('success'));
      } else {
        // Create
        await createUser({
          username: values.username,
          password: values.password,
          display_name: values.display_name || values.username,
          role: values.role || 'viewer',
        });
        message.success(t('success'));
      }
      setModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      if (detail) message.error(detail);
    }
  };

  const handleDelete = async (userId: number) => {
    try {
      await deleteUser(userId);
      message.success(t('success'));
      fetchUsers();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      if (detail) message.error(detail);
    }
  };

  const columns = [
    {
      title: t('username'),
      dataIndex: 'username',
      key: 'username',
      render: (text: string) => <Text strong><UserOutlined /> {text}</Text>,
    },
    {
      title: t('displayName'),
      dataIndex: 'display_name',
      key: 'display_name',
      render: (text: string) => text || '-',
    },
    {
      title: t('role'),
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (role: string) => (
        <Tag color={roleColorMap[role] || 'default'}>
          {t(`role${role.charAt(0).toUpperCase() + role.slice(1)}`)}
        </Tag>
      ),
    },
    {
      title: t('status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? t('active') : t('inactive')}</Tag>
      ),
    },
    {
      title: t('time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: t('actions'),
      key: 'actions',
      width: 150,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            {t('editUser')}
          </Button>
          <Popconfirm title={t('deleteUserConfirm')} onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} disabled={record.username === 'admin'}>
              {t('delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const adminCount = users.filter(u => u.role === 'admin').length;
  const operatorCount = users.filter(u => u.role === 'operator').length;
  const viewerCount = users.filter(u => u.role === 'viewer').length;

  return (
    <div>
      <Title level={2}>{t('userManagement')}</Title>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('roleAdmin')} value={adminCount} prefix={<SafetyCertificateOutlined />} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('roleOperator')} value={operatorCount} prefix={<EditOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('roleViewer')} value={viewerCount} prefix={<EyeOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('totalAlerts')} value={users.length} prefix={<UserOutlined />} />
          </Card>
        </Col>
      </Row>

      <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ marginBottom: 16 }}>
        {t('createUser')}
      </Button>

      <Table dataSource={users} columns={columns} rowKey="id" loading={loading} />

      <Modal
        open={modalOpen}
        title={editingUser ? t('editUser') : t('createUser')}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText={t('save')}
      >
        <Form form={form} layout="vertical">
          {!editingUser && (
            <Form.Item name="username" label={t('username')} rules={[{ required: true, message: t('usernameRequired') }]}>
              <Input prefix={<UserOutlined />} />
            </Form.Item>
          )}
          <Form.Item 
            name="password" 
            label={editingUser ? t('newPassword') : t('password')}
            rules={editingUser ? [] : [{ required: true, message: t('passwordRequired') }, { min: 6, message: t('passwordMinLength') }]}
          >
            <Input.Password placeholder={editingUser ? t('changePassword') : t('password')} />
          </Form.Item>
          <Form.Item name="display_name" label={t('displayName')}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label={t('role')} initialValue="viewer">
            <Select options={[
              { value: 'admin', label: t('roleAdmin') },
              { value: 'operator', label: t('roleOperator') },
              { value: 'viewer', label: t('roleViewer') },
            ]} />
          </Form.Item>
          {editingUser && (
            <Form.Item name="is_active" label={t('status')} initialValue={true}>
              <Select options={[
                { value: true, label: t('active') },
                { value: false, label: t('inactive') },
              ]} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;
