import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, Select, Tabs, Space, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useLanguage } from '../services/i18n';
import { getRoutingRules, createRoutingRule, updateRoutingRule, deleteRoutingRule,
         getSuppressionRules, createSuppressionRule, updateSuppressionRule, deleteSuppressionRule,
         getNotificationChannels } from '../services/api';

const AlertRules: React.FC = () => {
  const { t } = useLanguage();
  const [routingRules, setRoutingRules] = useState<any[]>([]);
  const [suppressionRules, setSuppressionRules] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [modalType, setModalType] = useState<'routing' | 'suppression'>('routing');
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [rRes, sRes, cRes] = await Promise.all([getRoutingRules(), getSuppressionRules(), getNotificationChannels()]);
      setRoutingRules(rRes.data);
      setSuppressionRules(sRes.data);
      setChannels(cRes.data);
    } catch { message.error(t('failed')); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const channelOptions = channels.map((c: any) => ({ label: `${c.name} (${c.channel_type})`, value: c.id }));

  const showModal = (type: 'routing' | 'suppression', rule?: any) => {
    setModalType(type);
    setEditingRule(rule || null);
    if (rule) {
      const ml = JSON.parse(rule.match_labels || '{}');
      const labelsArr = Object.entries(ml).map(([k, v]) => ({ key: k, value: v }));
      form.setFieldsValue({
        ...rule,
        match_labels: labelsArr,
        match_severity: rule.match_severity ? rule.match_severity.split(',').map((s: string) => s.trim()) : [],
        channel_ids: JSON.parse(rule.channel_ids || '[]'),
        start_time: rule.start_time ? new Date(rule.start_time) : undefined,
        end_time: rule.end_time ? new Date(rule.end_time) : undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ is_active: true, priority: 0, match_labels: [], match_severity: [], channel_ids: [], suppression_type: 'label' });
    }
    setModalOpen(true);
  };

  const onFinish = async (values: any) => {
    const labelsObj: any = {};
    (values.match_labels || []).forEach((item: any) => { if (item?.key) labelsObj[item.key] = item.value || ''; });
    const data: any = {
      name: values.name,
      description: values.description || '',
      is_active: values.is_active ?? true,
      match_labels: JSON.stringify(labelsObj),
      match_severity: (values.match_severity || []).join(','),
    };
    if (modalType === 'routing') {
      data.priority = values.priority || 0;
      data.channel_ids = JSON.stringify(values.channel_ids || []);
    } else {
      data.suppression_type = values.suppression_type || 'label';
      if (values.suppression_type === 'maintenance') {
        data.start_time = values.start_time?.toISOString();
        data.end_time = values.end_time?.toISOString();
      }
      if (values.suppression_type === 'frequency') {
        data.frequency_minutes = values.frequency_minutes || 5;
      }
    }
    try {
      if (editingRule) {
        if (modalType === 'routing') await updateRoutingRule(editingRule.id, data);
        else await updateSuppressionRule(editingRule.id, data);
        message.success(t('success'));
      } else {
        if (modalType === 'routing') await createRoutingRule(data);
        else await createSuppressionRule(data);
        message.success(t('success'));
      }
      setModalOpen(false);
      loadData();
    } catch { message.error(t('failed')); }
  };

  const handleDelete = async (type: 'routing' | 'suppression', id: number) => {
    try {
      if (type === 'routing') await deleteRoutingRule(id);
      else await deleteSuppressionRule(id);
      message.success(t('success'));
      loadData();
    } catch { message.error(t('failed')); }
  };

  const renderLabels = (labelsStr: string) => {
    try {
      const obj = JSON.parse(labelsStr || '{}');
      const entries = Object.entries(obj);
      if (!entries.length) return <Tag>{t('matchAll')}</Tag>;
      return <span>{entries.map(([k, v]) => <Tag key={k} color="blue">{k}={String(v)}</Tag>)}</span>;
    } catch { return labelsStr; }
  };

  const routingColumns = [
    { title: t('ruleName'), dataIndex: 'name', key: 'name' },
    { title: t('priority'), dataIndex: 'priority', key: 'priority', width: 80, render: (v: number) => <Tag color={v === 0 ? 'gold' : 'default'}>{v}</Tag> },
    { title: t('matchLabels'), dataIndex: 'match_labels', key: 'ml', render: (v: string) => renderLabels(v) },
    { title: t('matchSeverity'), dataIndex: 'match_severity', key: 'ms', render: (v: string) => v ? v.split(',').map((s: string) => <Tag key={s}>{s.trim()}</Tag>) : <Tag>{t('matchAll')}</Tag> },
    { title: t('targetChannels'), dataIndex: 'channel_ids', key: 'ch', render: (v: string) => {
      try {
        const ids: number[] = JSON.parse(v || '[]');
        return ids.map(id => { const ch = channels.find((c: any) => c.id === id); return ch ? <Tag key={id} color="cyan">{ch.name}</Tag> : <Tag key={id}>#{id}</Tag>; });
      } catch { return v; }
    }},
    { title: t('isActive'), dataIndex: 'is_active', key: 'ia', width: 80, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? t('active') : t('inactive')}</Tag> },
    { title: t('actions'), key: 'actions', width: 120, render: (_: any, r: any) => <Space>
      <Button size="small" icon={<EditOutlined />} onClick={() => showModal('routing', r)} />
      <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete('routing', r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
    </Space> },
  ];

  const suppressionColumns = [
    { title: t('ruleName'), dataIndex: 'name', key: 'name' },
    { title: t('suppressionType'), dataIndex: 'suppression_type', key: 'st', width: 100, render: (v: string) => {
      const map: any = { label: t('labelMatch'), maintenance: t('maintenanceWindow'), frequency: t('frequencyLimit') };
      return <Tag color={{ label: 'orange', maintenance: 'purple', frequency: 'cyan' }[v] || 'default'}>{map[v] || v}</Tag>;
    }},
    { title: t('matchLabels'), dataIndex: 'match_labels', key: 'ml', render: (v: string) => renderLabels(v) },
    { title: t('matchSeverity'), dataIndex: 'match_severity', key: 'ms', render: (v: string) => v ? v.split(',').map((s: string) => <Tag key={s}>{s.trim()}</Tag>) : <Tag>{t('matchAll')}</Tag> },
    { title: t('maintenanceWindow'), key: 'mw', width: 200, render: (_: any, r: any) => r.suppression_type === 'maintenance' && r.start_time ? `${new Date(r.start_time).toLocaleString()} ~ ${r.end_time ? new Date(r.end_time).toLocaleString() : '...'}` : '-' },
    { title: t('frequencyMinutes'), dataIndex: 'frequency_minutes', key: 'fm', width: 100, render: (v: number, r: any) => r.suppression_type === 'frequency' ? `${v}min` : '-' },
    { title: t('isActive'), dataIndex: 'is_active', key: 'ia', width: 80, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? t('active') : t('inactive')}</Tag> },
    { title: t('actions'), key: 'actions', width: 120, render: (_: any, r: any) => <Space>
      <Button size="small" icon={<EditOutlined />} onClick={() => showModal('suppression', r)} />
      <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete('suppression', r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
    </Space> },
  ];

  return (
    <div>
      <Tabs defaultActiveKey="routing" items={[
        { key: 'routing', label: t('routingRules'), children: <div>
          <div style={{ marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={() => showModal('routing')}>{t('addRule')}</Button></div>
          <Table dataSource={routingRules} columns={routingColumns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 15 }} />
        </div>},
        { key: 'suppression', label: t('suppressionRules'), children: <div>
          <div style={{ marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={() => showModal('suppression')}>{t('addRule')}</Button></div>
          <Table dataSource={suppressionRules} columns={suppressionColumns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 15 }} />
        </div>},
      ]} />

      <Modal title={editingRule ? t('editRule') : t('addRule')} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} width={600} destroyOnClose>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="name" label={t('ruleName')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label={t('description')}><Input /></Form.Item>
          {modalType === 'routing' && <Form.Item name="priority" label={t('priority')} extra={t('lowerPriorityFirst')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>}
          <Form.Item name="match_labels" label={t('matchLabels')}>
            <Form.List name="match_labels">
              {(fields, { add, remove }) => <>
                {fields.map(({ key, name, ...rest }) => <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item {...rest} name={[name, 'key']} rules={[{ required: true }]}><Input placeholder={t('labelKey')} style={{ width: 140 }} /></Form.Item>
                  <Form.Item {...rest} name={[name, 'value']}><Input placeholder={t('labelValue')} style={{ width: 140 }} /></Form.Item>
                  <Button onClick={() => remove(name)} danger size="small">{t('removeLabel')}</Button>
                </Space>)}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>{t('addLabel')}</Button>
              </>}
            </Form.List>
          </Form.Item>
          <Form.Item name="match_severity" label={t('matchSeverity')}>
            <Select mode="multiple" options={[{ label: 'critical', value: 'critical' }, { label: 'warning', value: 'warning' }, { label: 'info', value: 'info' }]} placeholder={t('matchAll')} allowClear />
          </Form.Item>
          {modalType === 'routing' && <Form.Item name="channel_ids" label={t('targetChannels')} rules={[{ required: true }]}>
            <Select mode="multiple" options={channelOptions} />
          </Form.Item>}
          {modalType === 'suppression' && <>
            <Form.Item name="suppression_type" label={t('suppressionType')}>
              <Select options={[{ label: t('labelMatch'), value: 'label' }, { label: t('maintenanceWindow'), value: 'maintenance' }, { label: t('frequencyLimit'), value: 'frequency' }]} />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.suppression_type !== cur.suppression_type}>
              {({ getFieldValue }) => {
                const st = getFieldValue('suppression_type');
                if (st === 'maintenance') return <>
                  <Form.Item name="start_time" label={t('startTime')}><Input type="datetime-local" /></Form.Item>
                  <Form.Item name="end_time" label={t('endTime')}><Input type="datetime-local" /></Form.Item>
                </>;
                if (st === 'frequency') return <Form.Item name="frequency_minutes" label={t('frequencyMinutes')}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>;
                return null;
              }}
            </Form.Item>
          </>}
          <Form.Item name="is_active" label={t('isActive')} valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AlertRules;
