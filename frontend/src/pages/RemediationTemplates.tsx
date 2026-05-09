import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Space, Tag, message, Popconfirm, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useLanguage } from '../services/i18n';
import { getRemediationTemplates, createRemediationTemplate, updateRemediationTemplate, deleteRemediationTemplate } from '../services/api';

const { TextArea } = Input;

const RemediationTemplates: React.FC = () => {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try { const res = await getRemediationTemplates(); setTemplates(res.data); } catch { message.error(t('failed')); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const showModal = (tmpl?: any) => {
    setEditing(tmpl || null);
    if (tmpl) {
      const ml = JSON.parse(tmpl.match_labels || '{}');
      const labelsArr = Object.entries(ml).map(([k, v]) => ({ key: k, value: v }));
      form.setFieldsValue({
        ...tmpl,
        match_labels: labelsArr,
        match_severity: tmpl.match_severity ? tmpl.match_severity.split(',').map((s: string) => s.trim()) : [],
        requires_approval: tmpl.requires_approval,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ is_active: true, category: 'general', action_type: 'shell', risk_level: 'medium', requires_approval: true, match_labels: [], match_severity: [] });
    }
    setModalOpen(true);
  };

  const onFinish = async (values: any) => {
    const labelsObj: any = {};
    (values.match_labels || []).forEach((item: any) => { if (item?.key) labelsObj[item.key] = item.value || ''; });
    const data = {
      name: values.name, description: values.description || '',
      category: values.category, action_type: values.action_type,
      config_template: values.config_template || '{}',
      match_labels: JSON.stringify(labelsObj),
      match_severity: (values.match_severity || []).join(','),
      match_keywords: values.match_keywords || '',
      risk_level: values.risk_level,
      requires_approval: values.requires_approval ?? true,
      is_active: values.is_active ?? true,
    };
    try {
      if (editing) await updateRemediationTemplate(editing.id, data);
      else await createRemediationTemplate(data);
      message.success(t('success'));
      setModalOpen(false);
      loadData();
    } catch { message.error(t('failed')); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteRemediationTemplate(id); message.success(t('success')); loadData(); } catch { message.error(t('failed')); }
  };

  const categoryColor: any = { restart: 'orange', disk: 'purple', network: 'cyan', service: 'blue', general: 'default' };
  const riskColor: any = { low: 'green', medium: 'orange', high: 'red' };

  const columns = [
    { title: t('ruleName'), dataIndex: 'name', key: 'name' },
    { title: t('category'), dataIndex: 'category', key: 'cat', width: 80, render: (v: string) => <Tag color={categoryColor[v] || 'default'}>{t(v)}</Tag> },
    { title: t('actionType'), dataIndex: 'action_type', key: 'at', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: t('riskLevel'), dataIndex: 'risk_level', key: 'rl', width: 80, render: (v: string) => <Tag color={riskColor[v] || 'default'}>{v}</Tag> },
    { title: t('requiresApproval'), dataIndex: 'requires_approval', key: 'ra', width: 90, render: (v: boolean) => <Tag color={v ? 'orange' : 'green'}>{v ? t('requiresApproval') : t('autoExecute')}</Tag> },
    { title: t('usageCount'), dataIndex: 'usage_count', key: 'uc', width: 80 },
    { title: t('successRate'), dataIndex: 'success_rate', key: 'sr', width: 80, render: (v: string) => {
      try { const [c, t] = v.split('/').map(Number); return t > 0 ? `${Math.round(c/t*100)}%` : '-'; } catch { return '-'; }
    }},
    { title: t('matchKeywords'), dataIndex: 'match_keywords', key: 'mk', ellipsis: true, render: (v: string) => v ? v.split(',').slice(0,3).map((k: string) => <Tag key={k}>{k.trim()}</Tag>) : '-' },
    { title: t('isActive'), dataIndex: 'is_active', key: 'ia', width: 70, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? t('active') : t('inactive')}</Tag> },
    { title: t('actions'), key: 'actions', width: 100, render: (_: any, r: any) => <Space>
      <Button size="small" icon={<EditOutlined />} onClick={() => showModal(r)} />
      <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
    </Space> },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>{t('addTemplate')}</Button></div>
      <Table dataSource={templates} columns={columns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 15 }} />

      <Modal title={editing ? t('editTemplate') : t('addTemplate')} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} width={650} destroyOnClose>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="name" label={t('ruleName')} rules={[{ required: true }]} style={{ width: '50%' }}><Input /></Form.Item>
            <Form.Item name="category" label={t('category')} style={{ width: '25%' }}>
              <Select options={[{ label: t('restart'), value: 'restart' }, { label: t('disk'), value: 'disk' }, { label: t('network'), value: 'network' }, { label: t('service'), value: 'service' }, { label: t('general'), value: 'general' }]} />
            </Form.Item>
            <Form.Item name="action_type" label={t('actionType')} style={{ width: '25%' }}>
              <Select options={[{ label: 'Shell', value: 'shell' }, { label: 'HTTP', value: 'http' }, { label: 'Webhook', value: 'webhook' }, { label: 'Script', value: 'script' }]} />
            </Form.Item>
          </Space>
          <Form.Item name="description" label={t('description')}><Input /></Form.Item>
          <Form.Item name="config_template" label={t('configTemplate')} extra={t('placeholderHint')} rules={[{ required: true }]}>
            <TextArea rows={3} placeholder='{"command": "systemctl restart {{service_name}}"}' />
          </Form.Item>
          <Form.Item name="match_labels" label={t('matchLabels')}>
            <Form.List name="match_labels">
              {(fields, { add, remove }) => <>
                {fields.map(({ key, name, ...rest }) => <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item {...rest} name={[name, 'key']} rules={[{ required: true }]}><Input placeholder={t('labelKey')} style={{ width: 120 }} /></Form.Item>
                  <Form.Item {...rest} name={[name, 'value']}><Input placeholder={t('labelValue')} style={{ width: 120 }} /></Form.Item>
                  <Button onClick={() => remove(name)} danger size="small">{t('removeLabel')}</Button>
                </Space>)}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>{t('addLabel')}</Button>
              </>}
            </Form.List>
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="match_severity" label={t('matchSeverity')} style={{ width: '50%' }}>
              <Select mode="multiple" options={[{ label: 'critical', value: 'critical' }, { label: 'warning', value: 'warning' }, { label: 'info', value: 'info' }]} placeholder={t('matchAll')} allowClear />
            </Form.Item>
            <Form.Item name="match_keywords" label={t('matchKeywords')} style={{ width: '50%' }}>
              <Input placeholder="关键词1,关键词2,..." />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="risk_level" label={t('riskLevel')} style={{ width: '33%' }}>
              <Select options={[{ label: t('low'), value: 'low' }, { label: t('medium'), value: 'medium' }, { label: 'critical', value: 'high' }]} />
            </Form.Item>
            <Form.Item name="requires_approval" label={t('requiresApproval')} valuePropName="checked" style={{ width: '33%' }}><Switch /></Form.Item>
            <Form.Item name="is_active" label={t('isActive')} valuePropName="checked" style={{ width: '33%' }}><Switch /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default RemediationTemplates;
