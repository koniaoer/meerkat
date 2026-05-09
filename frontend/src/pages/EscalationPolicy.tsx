import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, Space, Tag, message, Popconfirm, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useLanguage } from '../services/i18n';
import { getEscalationPolicies, createEscalationPolicy, updateEscalationPolicy, deleteEscalationPolicy,
         getEscalationEvents, getNotificationChannels, getUsers } from '../services/api';

const EscalationPolicy: React.FC = () => {
  const { t } = useLanguage();
  const [policies, setPolicies] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, eRes, cRes, uRes] = await Promise.all([getEscalationPolicies(), getEscalationEvents(), getNotificationChannels(), getUsers()]);
      setPolicies(pRes.data);
      setEvents(eRes.data);
      setChannels(cRes.data);
      setUsers(uRes.data);
    } catch { message.error(t('failed')); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const channelOptions = channels.map((c: any) => ({ label: `${c.name} (${c.channel_type})`, value: c.id }));
  const userOptions = users.filter((u: any) => u.is_active).map((u: any) => ({ label: u.display_name || u.username, value: u.id }));

  const showModal = (policy?: any) => {
    setEditing(policy || null);
    if (policy) {
      const ml = JSON.parse(policy.match_labels || '{}');
      const labelsArr = Object.entries(ml).map(([k, v]) => ({ key: k, value: v }));
      let rulesArr: any[] = [];
      try { rulesArr = JSON.parse(policy.rules || '[]'); } catch {}
      form.setFieldsValue({
        ...policy,
        match_labels: labelsArr,
        match_severity: policy.match_severity ? policy.match_severity.split(',').map((s: string) => s.trim()) : [],
        rules: rulesArr.map((r: any) => ({
          level: r.level, wait_minutes: r.wait_minutes,
          channel_ids: r.channel_ids || [], user_ids: r.user_ids || [],
        })),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ is_active: true, match_labels: [], match_severity: [], rules: [{ level: 1, wait_minutes: 5, channel_ids: [], user_ids: [] }], repeat_interval_minutes: 0 });
    }
    setModalOpen(true);
  };

  const onFinish = async (values: any) => {
    const labelsObj: any = {};
    (values.match_labels || []).forEach((item: any) => { if (item?.key) labelsObj[item.key] = item.value || ''; });
    const rules = (values.rules || []).map((r: any) => ({
      level: r.level, wait_minutes: r.wait_minutes,
      channel_ids: r.channel_ids || [], user_ids: r.user_ids || [],
    }));
    const data = {
      name: values.name, description: values.description || '',
      match_labels: JSON.stringify(labelsObj),
      match_severity: (values.match_severity || []).join(','),
      rules: JSON.stringify(rules),
      repeat_interval_minutes: values.repeat_interval_minutes || 0,
      is_active: values.is_active ?? true,
    };
    try {
      if (editing) await updateEscalationPolicy(editing.id, data);
      else await createEscalationPolicy(data);
      message.success(t('success'));
      setModalOpen(false);
      loadData();
    } catch { message.error(t('failed')); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteEscalationPolicy(id); message.success(t('success')); loadData(); } catch { message.error(t('failed')); }
  };

  const policyColumns = [
    { title: t('ruleName'), dataIndex: 'name', key: 'name' },
    { title: t('escalationRules'), dataIndex: 'rules', key: 'rules', render: (v: string) => {
      try {
        const rules = JSON.parse(v || '[]');
        return rules.map((r: any) => <Tag key={r.level} color="orange">L{r.level}: {r.wait_minutes}min</Tag>);
      } catch { return v; }
    }},
    { title: t('matchSeverity'), dataIndex: 'match_severity', key: 'ms', render: (v: string) => v ? v.split(',').map((s: string) => <Tag key={s}>{s}</Tag>) : <Tag>{t('matchAll')}</Tag> },
    { title: t('repeatInterval'), dataIndex: 'repeat_interval_minutes', key: 'ri', width: 120, render: (v: number) => v > 0 ? `${v}min` : t('noRepeat') },
    { title: t('isActive'), dataIndex: 'is_active', key: 'ia', width: 80, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? t('active') : t('inactive')}</Tag> },
    { title: t('actions'), key: 'actions', width: 120, render: (_: any, r: any) => <Space>
      <Button size="small" icon={<EditOutlined />} onClick={() => showModal(r)} />
      <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
    </Space> },
  ];

  const eventColumns = [
    { title: t('time'), dataIndex: 'created_at', key: 'time', width: 180, render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Alert ID', dataIndex: 'alert_id', key: 'aid', width: 80 },
    { title: t('level'), dataIndex: 'current_level', key: 'lvl', width: 60, render: (v: number) => <Tag color="red">L{v}</Tag> },
    { title: t('status'), dataIndex: 'status', key: 'st', width: 100, render: (v: string) => <Tag color={{ active: 'red', acknowledged: 'green', resolved: 'blue', expired: 'default' }[v] || 'default'}>{v}</Tag> },
    { title: t('lastEscalated'), dataIndex: 'last_escalated_at', key: 'le', width: 180, render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
  ];

  return (
    <div>
      <Tabs defaultActiveKey="policies" items={[
        { key: 'policies', label: t('escalationPolicy'), children: <div>
          <div style={{ marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>{t('addRule')}</Button></div>
          <Table dataSource={policies} columns={policyColumns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 15 }} />
        </div>},
        { key: 'events', label: t('escalationEvents'), children: <Table dataSource={events} columns={eventColumns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 15 }} /> },
      ]} />

      <Modal title={editing ? t('editRule') : t('addRule')} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} width={700} destroyOnClose>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="name" label={t('ruleName')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label={t('description')}><Input /></Form.Item>
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
          <Form.Item name="match_severity" label={t('matchSeverity')}>
            <Select mode="multiple" options={[{ label: 'critical', value: 'critical' }, { label: 'warning', value: 'warning' }, { label: 'info', value: 'info' }]} placeholder={t('matchAll')} allowClear />
          </Form.Item>
          <Form.Item name="rules" label={t('escalationRules')}>
            <Form.List name="rules">
              {(fields, { add, remove }) => <>
                {fields.map(({ key, name, ...rest }) => <div key={key} style={{ marginBottom: 12, padding: 8, border: '1px dashed var(--ant-color-border)', borderRadius: 4 }}>
                  <Space style={{ marginBottom: 8 }}>
                    <Form.Item {...rest} name={[name, 'level']} label={t('level')}><InputNumber min={1} style={{ width: 70 }} /></Form.Item>
                    <Form.Item {...rest} name={[name, 'wait_minutes']} label={t('waitMinutes')}><InputNumber min={1} style={{ width: 90 }} /></Form.Item>
                    <Button onClick={() => remove(name)} danger size="small">{t('removeLabel')}</Button>
                  </Space>
                  <div>
                    <Form.Item {...rest} name={[name, 'channel_ids']} label={t('notifyChannels')}><Select mode="multiple" options={channelOptions} placeholder={t('targetChannels')} style={{ width: '100%' }} /></Form.Item>
                    <Form.Item {...rest} name={[name, 'user_ids']} label={t('notifyUsers')}><Select mode="multiple" options={userOptions} style={{ width: '100%' }} /></Form.Item>
                  </div>
                </div>)}
                <Button type="dashed" onClick={() => add({ level: fields.length + 1, wait_minutes: 5, channel_ids: [], user_ids: [] })} block icon={<PlusOutlined />}>{t('addLevel')}</Button>
              </>}
            </Form.List>
          </Form.Item>
          <Form.Item name="repeat_interval_minutes" label={t('repeatInterval')} extra="0 = 不重复">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_active" label={t('isActive')} valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EscalationPolicy;
