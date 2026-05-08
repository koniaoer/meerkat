import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Switch, Space, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined } from '@ant-design/icons';
import { getDingTalkConfigs, createDingTalkConfig, updateDingTalkConfig, deleteDingTalkConfig, testDingTalkConfig } from '../services/api';
import { useLanguage } from '../services/i18n';

const DingTalkConfigPage: React.FC = () => {
  const { t } = useLanguage();
  const [configs, setConfigs] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchConfigs = async () => {
    try {
      const res = await getDingTalkConfigs();
      setConfigs(res.data);
    } catch (error) {
      message.error(t('failed'));
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const showModal = (config?: any) => {
    if (config) {
      setEditingConfig(config);
      form.setFieldsValue(config);
    } else {
      setEditingConfig(null);
      form.resetFields();
    }
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const onFinish = async (values: any) => {
    try {
      if (editingConfig) {
        await updateDingTalkConfig(editingConfig.id, values);
      } else {
        await createDingTalkConfig(values);
      }
      message.success(t('success'));
      setIsModalVisible(false);
      fetchConfigs();
    } catch (error) {
      message.error(t('failed'));
    }
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTestLoading(true);
      await testDingTalkConfig(values);
      message.success(t('testSuccess'));
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || t('testFailed');
      message.error(errorMsg);
    } finally {
      setTestLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDingTalkConfig(id);
      message.success(t('success'));
      fetchConfigs();
    } catch (error) {
      message.error(t('failed'));
    }
  };

  const columns = [
    { title: t('webhookUrl'), dataIndex: 'webhook_url', key: 'webhook_url', ellipsis: true },
    { 
        title: t('isActive'), 
        dataIndex: 'is_active', 
        key: 'is_active',
        render: (active: boolean) => <Switch checked={active} disabled />
    },
    {
      title: t('actions'),
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => showModal(record)}>{t('editConfig')}</Button>
          <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger>{t('delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{t('dingtalkConfig')}</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
          {t('addConfig')}
        </Button>
      </div>

      <Table dataSource={configs} columns={columns} rowKey="id" />

      <Modal
        title={editingConfig ? t('editConfig') : t('addConfig')}
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="webhook_url" label={t('webhookUrl')} rules={[{ required: true }]}>
            <Input placeholder="https://oapi.dingtalk.com/robot/send?access_token=***" />
          </Form.Item>
          <Form.Item name="secret" label={t('secret')}>
            <Input.Password placeholder="Optional secret for signing" />
          </Form.Item>
          <Form.Item name="is_active" label={t('isActive')} valuePropName="checked">
            <Switch defaultChecked />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button 
                icon={<SendOutlined />} 
                onClick={handleTest} 
                loading={testLoading}
              >
                {t('testDingTalk')}
              </Button>
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

export default DingTalkConfigPage;
