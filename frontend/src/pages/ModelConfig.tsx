import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Switch, Space, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, RocketOutlined } from '@ant-design/icons';
import { getModelConfigs, createModelConfig, updateModelConfig, deleteModelConfig, testModelConfig } from '../services/api';
import { useLanguage } from '../services/i18n';

const ModelConfigPage: React.FC = () => {
  const { t } = useLanguage();
  const [configs, setConfigs] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchConfigs = async () => {
    try {
      const res = await getModelConfigs();
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
        await updateModelConfig(editingConfig.id, values);
        message.success(t('success'));
      } else {
        await createModelConfig(values);
        message.success(t('success'));
      }
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
      await testModelConfig(values);
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
      await deleteModelConfig(id);
      message.success(t('success'));
      fetchConfigs();
    } catch (error) {
      message.error(t('failed'));
    }
  };

  const columns = [
    { title: t('provider'), dataIndex: 'provider_name', key: 'provider_name' },
    { title: t('modelName'), dataIndex: 'model_name', key: 'model_name' },
    { title: t('baseUrl'), dataIndex: 'base_url', key: 'base_url' },
    { 
      title: t('apiKey'), 
      dataIndex: 'api_key', 
      key: 'api_key',
      render: (v: string) => v ? `${v.slice(0, 4)}${'*'.repeat(Math.max(v.length - 4, 4))}` : '-'
    },
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
          <Button icon={<EditOutlined />} onClick={() => showModal(record)}>{t('editModel')}</Button>
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
        <h2>{t('models')}</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
          {t('addModel')}
        </Button>
      </div>

      <Table dataSource={configs} columns={columns} rowKey="id" />

      <Modal
        title={editingConfig ? t('editModel') : t('addModel')}
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="provider_name" label={t('provider')} rules={[{ required: true }]}>
            <Input placeholder="e.g. OpenAI, DeepSeek" />
          </Form.Item>
          <Form.Item name="model_name" label={t('modelName')} rules={[{ required: true }]}>
            <Input placeholder="e.g. gpt-4, deepseek-chat" />
          </Form.Item>
          <Form.Item name="base_url" label={t('baseUrl')} rules={[{ required: true }]}>
            <Input placeholder="e.g. https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item name="api_key" label={t('apiKey')} rules={[{ required: true }]}>
            <Input.Password placeholder={editingConfig ? '点击眼睛查看当前密钥，输入新值则更新' : 'Enter your API Key'} />
          </Form.Item>
          <Form.Item name="is_active" label={t('isActive')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button 
                icon={<RocketOutlined />} 
                onClick={handleTest} 
                loading={testLoading}
              >
                {t('testModel')}
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

export default ModelConfigPage;
