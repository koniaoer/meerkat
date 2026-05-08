import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Switch, Select, Space, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined } from '@ant-design/icons';
import { getNotificationChannels, createNotificationChannel, updateNotificationChannel, deleteNotificationChannel, testNotificationChannel } from '../services/api';
import { useLanguage } from '../services/i18n';

const channelTypeIcons: Record<string, string> = {
  dingtalk: 'DingTalk',
  wecom: 'WeCom',
  slack: 'Slack',
  email: 'Email',
  webhook: 'Webhook',
};

const DingTalkConfigFields = () => (
  <>
    <Form.Item name={['config', 'webhook_url']} label="Webhook URL" rules={[{ required: true }]}>
      <Input placeholder="https://oapi.dingtalk.com/robot/send?access_token=***" />
    </Form.Item>
    <Form.Item name={['config', 'secret']} label="Secret">
      <Input.Password placeholder="Optional secret for signing" />
    </Form.Item>
  </>
);

const WeComConfigFields = () => (
  <Form.Item name={['config', 'webhook_url']} label="Webhook URL" rules={[{ required: true }]}>
    <Input placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=***" />
  </Form.Item>
);

const SlackConfigFields = () => (
  <Form.Item name={['config', 'webhook_url']} label="Webhook URL" rules={[{ required: true }]}>
    <Input placeholder="https://hooks.slack.com/services/***" />
  </Form.Item>
);

const EmailConfigFields = () => (
  <>
    <Form.Item name={['config', 'smtp_host']} label="SMTP Host" rules={[{ required: true }]}>
      <Input placeholder="smtp.example.com" />
    </Form.Item>
    <Form.Item name={['config', 'smtp_port']} label="SMTP Port" rules={[{ required: true }]}>
      <Input placeholder="465" />
    </Form.Item>
    <Form.Item name={['config', 'smtp_user']} label="SMTP User" rules={[{ required: true }]}>
      <Input placeholder="user@example.com" />
    </Form.Item>
    <Form.Item name={['config', 'smtp_password']} label="SMTP Password" rules={[{ required: true }]}>
      <Input.Password />
    </Form.Item>
    <Form.Item name={['config', 'from_addr']} label="From" rules={[{ required: true }]}>
      <Input placeholder="alert@example.com" />
    </Form.Item>
    <Form.Item name={['config', 'to_addrs']} label="To (comma separated)" rules={[{ required: true }]}>
      <Input placeholder="admin@example.com,ops@example.com" />
    </Form.Item>
  </>
);

const WebhookConfigFields = () => (
  <>
    <Form.Item name={['config', 'url']} label="URL" rules={[{ required: true }]}>
      <Input placeholder="https://example.com/webhook" />
    </Form.Item>
    <Form.Item name={['config', 'method']} label="Method">
      <Select options={[{ value: 'POST' }, { value: 'PUT' }]} placeholder="POST" />
    </Form.Item>
    <Form.Item name={['config', 'headers']} label="Headers (JSON)">
      <Input.TextArea rows={3} placeholder='{"Content-Type": "application/json"}' />
    </Form.Item>
  </>
);

const configFieldsMap: Record<string, React.FC> = {
  dingtalk: DingTalkConfigFields,
  wecom: WeComConfigFields,
  slack: SlackConfigFields,
  email: EmailConfigFields,
  webhook: WebhookConfigFields,
};

const NotificationChannels: React.FC = () => {
  const { t } = useLanguage();
  const [channels, setChannels] = useState<any[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<any>(null);
  const [testLoading, setTestLoading] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [channelType, setChannelType] = useState<string>('dingtalk');

  const fetchChannels = async () => {
    try {
      const res = await getNotificationChannels();
      setChannels(res.data);
    } catch (error) {
      message.error(t('failed'));
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const showModal = (channel?: any) => {
    if (channel) {
      setEditingChannel(channel);
      setChannelType(channel.channel_type);
      form.setFieldsValue({
        name: channel.name,
        channel_type: channel.channel_type,
        is_active: channel.is_active,
        config: channel.config || {},
      });
    } else {
      setEditingChannel(null);
      setChannelType('dingtalk');
      form.resetFields();
      form.setFieldsValue({ channel_type: 'dingtalk', is_active: true });
    }
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const onFinish = async (values: any) => {
    try {
      // Parse headers JSON for webhook
      if (values.channel_type === 'webhook' && typeof values.config?.headers === 'string') {
        try {
          values.config.headers = JSON.parse(values.config.headers);
        } catch {
          // leave as string if not valid JSON
        }
      }
      if (editingChannel) {
        await updateNotificationChannel(editingChannel.id, values);
      } else {
        await createNotificationChannel(values);
      }
      message.success(t('success'));
      setIsModalVisible(false);
      fetchChannels();
    } catch (error) {
      message.error(t('failed'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteNotificationChannel(id);
      message.success(t('success'));
      fetchChannels();
    } catch (error) {
      message.error(t('failed'));
    }
  };

  const handleTest = async (id: number) => {
    setTestLoading(id);
    try {
      await testNotificationChannel(id);
      message.success(t('testSuccess'));
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || t('testFailed');
      message.error(errorMsg);
    } finally {
      setTestLoading(null);
    }
  };

  const ConfigFields = configFieldsMap[channelType] || DingTalkConfigFields;

  const columns = [
    {
      title: t('channelName'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('channelType'),
      dataIndex: 'channel_type',
      key: 'channel_type',
      render: (type: string) => channelTypeIcons[type] || type,
    },
    {
      title: t('status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <span style={{ color: active ? '#52c41a' : '#999' }}>
          {active ? t('active') : t('inactive')}
        </span>
      ),
    },
    {
      title: t('actions'),
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => showModal(record)}>
            {t('editConfig')}
          </Button>
          <Button
            icon={<SendOutlined />}
            size="small"
            loading={testLoading === record.id}
            onClick={() => handleTest(record.id)}
          >
            {t('testPush')}
          </Button>
          <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger size="small">
              {t('delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{t('notificationChannels')}</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
          {t('addChannel')}
        </Button>
      </div>

      <Table dataSource={channels} columns={columns} rowKey="id" />

      <Modal
        title={editingChannel ? t('editChannel') : t('addChannel')}
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label={t('channelName')} rules={[{ required: true }]}>
            <Input placeholder={t('channelNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="channel_type" label={t('channelType')} rules={[{ required: true }]}>
            <Select
              onChange={(val) => setChannelType(val)}
              options={[
                { value: 'dingtalk', label: t('dingtalkChannel') },
                { value: 'wecom', label: t('wecomChannel') },
                { value: 'slack', label: t('slackChannel') },
                { value: 'email', label: t('emailChannel') },
                { value: 'webhook', label: t('webhookChannel') },
              ]}
            />
          </Form.Item>
          <ConfigFields />
          <Form.Item name="is_active" label={t('isActive')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button type="primary" htmlType="submit">
                {t('save')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default NotificationChannels;
