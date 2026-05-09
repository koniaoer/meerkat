import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Tag, Space, message, Popconfirm, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LikeOutlined, EyeOutlined } from '@ant-design/icons';
import { useLanguage } from '../services/i18n';
import { getKnowledgeArticles, createKnowledgeArticle, updateKnowledgeArticle, deleteKnowledgeArticle, markArticleHelpful } from '../services/api';

const { TextArea } = Input;

const KnowledgeBase: React.FC = () => {
  const { t } = useLanguage();
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (category) params.category = category;
      const res = await getKnowledgeArticles(params);
      setArticles(res.data);
    } catch { message.error(t('failed')); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [search, category]);

  const showModal = (art?: any) => {
    setEditing(art || null);
    if (art) form.setFieldsValue(art);
    else form.resetFields();
    setModalOpen(true);
  };

  const onFinish = async (values: any) => {
    try {
      if (editing) await updateKnowledgeArticle(editing.id, values);
      else await createKnowledgeArticle(values);
      message.success(t('success'));
      setModalOpen(false);
      loadData();
    } catch { message.error(t('failed')); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteKnowledgeArticle(id); message.success(t('success')); loadData(); } catch { message.error(t('failed')); }
  };

  const handleHelpful = async (id: number) => {
    try { await markArticleHelpful(id); loadData(); } catch {}
  };

  const catColor: any = { runbook: 'blue', troubleshoot: 'orange', faq: 'green', postmortem: 'purple', general: 'default' };

  const columns = [
    { title: t('title') || 'Title', dataIndex: 'title', key: 'title', ellipsis: true, render: (v: string, r: any) => <a onClick={() => { setViewing(r); setViewOpen(true); }}>{v}</a> },
    { title: t('category'), dataIndex: 'category', key: 'cat', width: 100, render: (v: string) => <Tag color={catColor[v] || 'default'}>{t(v)}</Tag> },
    { title: t('alertName'), dataIndex: 'alert_name', key: 'an', width: 120, ellipsis: true, render: (v: string) => v || '-' },
    { title: t('views'), dataIndex: 'view_count', key: 'vc', width: 60 },
    { title: t('helpful'), dataIndex: 'helpful_count', key: 'hc', width: 70, render: (v: number, r: any) => <Space><LikeOutlined onClick={() => handleHelpful(r.id)} style={{ cursor: 'pointer' }} />{v || 0}</Space> },
    { title: t('actions'), key: 'ac', width: 90, render: (_: any, r: any) => <Space>
      <Button size="small" icon={<EditOutlined />} onClick={() => showModal(r)} />
      <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
    </Space> },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search placeholder={t('searchKnowledge')} style={{ width: 250 }} onSearch={setSearch} allowClear />
        <Select allowClear placeholder={t('category')} style={{ width: 130 }} onChange={setCategory}
          options={[{ label: t('runbook'), value: 'runbook' }, { label: t('troubleshoot'), value: 'troubleshoot' }, { label: t('faq'), value: 'faq' }, { label: t('postmortem'), value: 'postmortem' }, { label: t('general'), value: 'general' }]} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>{t('addArticle')}</Button>
      </Space>
      <Table dataSource={articles} columns={columns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 15 }} />

      {/* View article */}
      <Modal title={viewing?.title} open={viewOpen} onCancel={() => setViewOpen(false)} footer={null} width={700}>
        {viewing && <div>
          <Space style={{ marginBottom: 12 }}>
            <Tag color={catColor[viewing.category]}>{t(viewing.category)}</Tag>
            {viewing.alert_name && <Tag>{viewing.alert_name}</Tag>}
            <span style={{ color: '#999', fontSize: 12 }}>{viewing.author} · {new Date(viewing.updated_at).toLocaleString()}</span>
          </Space>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{viewing.content}</div>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button icon={<LikeOutlined />} onClick={() => handleHelpful(viewing.id)}>{t('helpful')} ({viewing.helpful_count || 0})</Button>
          </div>
        </div>}
      </Modal>

      {/* Create/Edit article */}
      <Modal title={editing ? t('editArticle') : t('addArticle')} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} width={650} destroyOnClose>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="title" label={t('title')} rules={[{ required: true }]}><Input /></Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="category" label={t('category')} style={{ width: '50%' }}>
              <Select options={[{ label: t('runbook'), value: 'runbook' }, { label: t('troubleshoot'), value: 'troubleshoot' }, { label: t('faq'), value: 'faq' }, { label: t('postmortem'), value: 'postmortem' }, { label: t('general'), value: 'general' }]} />
            </Form.Item>
            <Form.Item name="alert_name" label={t('alertName')} style={{ width: '50%' }}><Input placeholder={t('optional')} /></Form.Item>
          </Space>
          <Form.Item name="tags" label={t('tags')}><Input placeholder="tag1,tag2,..." /></Form.Item>
          <Form.Item name="content" label={t('content')} rules={[{ required: true }]}><TextArea rows={10} placeholder={t('markdownSupported') || 'Markdown supported'} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default KnowledgeBase;
