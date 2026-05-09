import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, Space, Tag, message, Popconfirm, Card, Descriptions } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import { useLanguage } from '../services/i18n';
import { getOnCallSchedules, createOnCallSchedule, updateOnCallSchedule, deleteOnCallSchedule, getCurrentOnCall, getUsers } from '../services/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const OnCallSchedule: React.FC = () => {
  const { t } = useLanguage();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentOncall, setCurrentOncall] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [sRes, uRes, cRes] = await Promise.all([getOnCallSchedules(), getUsers(), getCurrentOnCall()]);
      setSchedules(sRes.data);
      setUsers(uRes.data);
      setCurrentOncall(cRes.data);
    } catch { message.error(t('failed')); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const userOptions = users.filter((u: any) => u.is_active).map((u: any) => ({ label: u.display_name || u.username, value: u.id }));

  const showModal = (schedule?: any) => {
    setEditing(schedule || null);
    if (schedule) {
      form.setFieldsValue({
        name: schedule.name,
        description: schedule.description,
        rotation_type: schedule.rotation_type,
        is_active: schedule.is_active,
        shifts: (schedule.shifts || []).map((s: any) => ({
          user_id: s.user_id,
          time_range: [dayjs(s.start_time), dayjs(s.end_time)],
        })),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ is_active: true, rotation_type: 'daily', shifts: [] });
    }
    setModalOpen(true);
  };

  const onFinish = async (values: any) => {
    const shifts = (values.shifts || []).map((s: any) => ({
      user_id: s.user_id,
      start_time: s.time_range[0].toISOString(),
      end_time: s.time_range[1].toISOString(),
    }));
    const data = { name: values.name, description: values.description, rotation_type: values.rotation_type, is_active: values.is_active, shifts };
    try {
      if (editing) {
        await updateOnCallSchedule(editing.id, data);
      } else {
        await createOnCallSchedule(data);
      }
      message.success(t('success'));
      setModalOpen(false);
      loadData();
    } catch { message.error(t('failed')); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteOnCallSchedule(id); message.success(t('success')); loadData(); } catch { message.error(t('failed')); }
  };

  const columns = [
    { title: t('ruleName'), dataIndex: 'name', key: 'name' },
    { title: t('rotationType'), dataIndex: 'rotation_type', key: 'rt', width: 100, render: (v: string) => <Tag color="blue">{t(v)}</Tag> },
    { title: t('shifts'), key: 'shifts', render: (_: any, r: any) => (r.shifts || []).map((s: any, i: number) => {
      const user = users.find((u: any) => u.id === s.user_id);
      return <Tag key={i} color="green"><UserOutlined /> {user?.display_name || user?.username || s.user_id} {dayjs(s.start_time).format('MM-DD HH:mm')}~{dayjs(s.end_time).format('MM-DD HH:mm')}</Tag>;
    })},
    { title: t('isActive'), dataIndex: 'is_active', key: 'ia', width: 80, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? t('active') : t('inactive')}</Tag> },
    { title: t('actions'), key: 'actions', width: 120, render: (_: any, r: any) => <Space>
      <Button size="small" icon={<EditOutlined />} onClick={() => showModal(r)} />
      <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
    </Space> },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={1}>
          <Descriptions.Item label={t('currentOnCall')}>
            {currentOncall?.username
              ? <Tag color="blue" style={{ fontSize: 14 }}><UserOutlined /> {currentOncall.display_name || currentOncall.username}</Tag>
              : <Tag>{t('noOnCall')}</Tag>}
          </Descriptions.Item>
        </Descriptions>
      </Card>
      <div style={{ marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>{t('addSchedule')}</Button></div>
      <Table dataSource={schedules} columns={columns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 15 }} />

      <Modal title={editing ? t('editSchedule') : t('addSchedule')} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} width={700} destroyOnClose>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="name" label={t('ruleName')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label={t('description')}><Input /></Form.Item>
          <Form.Item name="rotation_type" label={t('rotationType')}>
            <Select options={[{ label: t('daily'), value: 'daily' }, { label: t('weekly'), value: 'weekly' }, { label: t('custom'), value: 'custom' }]} />
          </Form.Item>
          <Form.Item name="shifts" label={t('shifts')}>
            <Form.List name="shifts">
              {(fields, { add, remove }) => <>
                {fields.map(({ key, name, ...rest }) => <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item {...rest} name={[name, 'user_id']} rules={[{ required: true }]}><Select options={userOptions} placeholder={t('username')} style={{ width: 140 }} /></Form.Item>
                  <Form.Item {...rest} name={[name, 'time_range']} rules={[{ required: true }]}><RangePicker showTime format="YYYY-MM-DD HH:mm" /></Form.Item>
                  <Button onClick={() => remove(name)} danger size="small">{t('removeLabel')}</Button>
                </Space>)}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>{t('addShift')}</Button>
              </>}
            </Form.List>
          </Form.Item>
          <Form.Item name="is_active" label={t('isActive')} valuePropName="checked"><Select options={[{ label: t('active'), value: true }, { label: t('inactive'), value: false }]} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default OnCallSchedule;
