import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Input, Select, Button, Tag, Space, Modal, Form, Typography, message, Popconfirm, Empty, Tooltip, Badge } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LikeOutlined, EyeOutlined, SearchOutlined,
  BookOutlined, ToolOutlined, QuestionCircleOutlined, WarningOutlined, FileTextOutlined,
  ReloadOutlined, BookFilled } from '@ant-design/icons';
import { useLanguage } from '../services/i18n';
import { getKnowledgeArticles, createKnowledgeArticle, updateKnowledgeArticle, deleteKnowledgeArticle, markArticleHelpful } from '../services/api';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

const categoryConfig: Record<string, { color: string; emoji: string; icon: any }> = {
  runbook: { color: '#1890ff', emoji: '📖', icon: BookOutlined },
  troubleshoot: { color: '#fa8c16', emoji: '🔧', icon: ToolOutlined },
  faq: { color: '#52c41a', emoji: '❓', icon: QuestionCircleOutlined },
  postmortem: { color: '#722ed1', emoji: '🔍', icon: WarningOutlined },
  general: { color: '#8c8c8c', emoji: '📄', icon: FileTextOutlined },
};

const KnowledgeBase: React.FC = () => {
  const { t } = useLanguage();
  const [allArticles, setAllArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [form] = Form.useForm();
  const [pageState, setPageState] = useState({ current: 1, pageSize: 12 });

  const filtered = React.useMemo(() => {
    let list = allArticles;
    if (categoryFilter) list = list.filter((a: any) => a.category === categoryFilter);
    if (searchText) {
      const lower = searchText.toLowerCase();
      list = list.filter((a: any) =>
        a.title?.toLowerCase().includes(lower) ||
        a.content?.toLowerCase().includes(lower) ||
        a.tags?.toLowerCase().includes(lower) ||
        a.alert_name?.toLowerCase().includes(lower)
      );
    }
    return list;
  }, [allArticles, categoryFilter, searchText]);

  const pagedArticles = React.useMemo(() => {
    const start = (pageState.current - 1) * pageState.pageSize;
    return filtered.slice(start, start + pageState.pageSize);
  }, [filtered, pageState]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getKnowledgeArticles({});
      setAllArticles(res.data);
    } catch { message.error(t('failed')); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, []);

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
    try { await deleteKnowledgeArticle(id); message.success(t('deleted')); loadData(); }
    catch { message.error(t('failed')); }
  };

  const handleHelpful = async (id: number) => {
    try { await markArticleHelpful(id); loadData(); } catch {}
  };

  const handleView = (art: any) => {
    setViewing(art);
    setViewOpen(true);
  };

  // Stats
  const stats = React.useMemo(() => {
    const byCat: Record<string, number> = {};
    allArticles.forEach((a: any) => { byCat[a.category] = (byCat[a.category] || 0) + 1; });
    return { total: allArticles.length, byCat };
  }, [allArticles]);

  const catOptions = [
    { value: 'runbook', label: `📖 ${t('runbook')}` },
    { value: 'troubleshoot', label: `🔧 ${t('troubleshoot')}` },
    { value: 'faq', label: `❓ ${t('faq')}` },
    { value: 'postmortem', label: `🔍 ${t('postmortem')}` },
    { value: 'general', label: `📄 ${t('general')}` },
  ];

  return (
    <div>
      {/* Stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.total}</div>
            <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)' }}>{t('knowledgeBase')}</div>
          </Card>
        </Col>
        {Object.entries(categoryConfig).map(([key, cfg]) => (
          <Col span={4} key={key}>
            <Card
              bordered={false} size="small"
              style={{ background: categoryFilter === key ? cfg.color : 'var(--ant-color-bg-elevated)', cursor: 'pointer', textAlign: 'center' }}
              onClick={() => { setCategoryFilter(categoryFilter === key ? undefined : key); setPageState(p => ({ ...p, current: 1 })); }}
            >
              <div style={{ fontSize: 20 }}>{cfg.emoji}</div>
              <div style={{ fontSize: 12, color: categoryFilter === key ? '#fff' : 'var(--ant-color-text-tertiary, #999)', marginTop: 2 }}>
                {t(key)} ({stats.byCat[key] || 0})
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }} align="middle">
        <Col>
          <Input
            prefix={<SearchOutlined />}
            placeholder={t('searchKnowledge')}
            allowClear style={{ width: 260 }}
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setPageState(p => ({ ...p, current: 1 })); }}
          />
        </Col>
        <Col>
          <Select allowClear placeholder={t('category')} style={{ width: 160 }} value={categoryFilter}
            onChange={(v) => { setCategoryFilter(v); setPageState(p => ({ ...p, current: 1 })); }}
            options={catOptions}
          />
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={loadData}>{t('refresh')}</Button>
        </Col>
        <Col flex="auto" />
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>{t('addArticle')}</Button>
        </Col>
      </Row>

      {/* Card Grid */}
      {pagedArticles.length === 0 ? (
        <Empty description={searchText || categoryFilter ? t('noResults') : t('noArticles')} style={{ padding: 60 }} />
      ) : (
        <Row gutter={[16, 16]}>
          {pagedArticles.map((art: any) => {
            const cfg = categoryConfig[art.category] || categoryConfig.general;
            const preview = art.content?.length > 120 ? art.content.slice(0, 120) + '...' : art.content;
            return (
              <Col xs={24} sm={12} lg={8} xl={6} key={art.id}>
                <Card
                  hoverable
                  size="small"
                  style={{
                    borderLeft: `3px solid ${cfg.color}`,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                  bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                  onClick={() => handleView(art)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <Text strong ellipsis style={{ flex: 1, fontSize: 14 }}>{art.title}</Text>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.emoji} {t(art.category)}</Tag>
                      {art.alert_name && <Tag style={{ margin: '0 0 0 4px' }} color="volcano">{art.alert_name}</Tag>}
                    </div>
                    <Paragraph
                      style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)', marginBottom: 8, lineHeight: 1.6 }}
                      ellipsis={{ rows: 3 }}
                    >
                      {preview}
                    </Paragraph>
                    {art.tags && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {art.tags.split(',').filter(Boolean).map((tag: string) => (
                          <Tag key={tag.trim()} style={{ fontSize: 10, margin: 0, lineHeight: '18px' }}>{tag.trim()}</Tag>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--ant-color-border, #f0f0f0)', paddingTop: 8, marginTop: 'auto' }}>
                    <Space size={12}>
                      <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary, #999)' }}>
                        <EyeOutlined /> {art.view_count || 0}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary, #999)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleHelpful(art.id); }}>
                        <LikeOutlined /> {art.helpful_count || 0}
                      </span>
                    </Space>
                    <Space size={4}>
                      <Tooltip title={t('editArticle')}><Button size="small" type="text" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); showModal(art); }} /></Tooltip>
                      <Popconfirm title={t('deleteConfirm')} onConfirm={(e?: any) => { e?.stopPropagation?.(); handleDelete(art.id); }}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                      </Popconfirm>
                    </Space>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Pagination */}
      {filtered.length > pageState.pageSize && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Space>
            <Button disabled={pageState.current === 1} onClick={() => setPageState(p => ({ ...p, current: p.current - 1 }))}>← {t('back')}</Button>
            <Text style={{ color: 'var(--ant-color-text-secondary, #666)' }}>
              {pageState.current} / {Math.ceil(filtered.length / pageState.pageSize)}
            </Text>
            <Button disabled={pageState.current >= Math.ceil(filtered.length / pageState.pageSize)} onClick={() => setPageState(p => ({ ...p, current: p.current + 1 }))}>{t('back')} →</Button>
            <Text style={{ color: 'var(--ant-color-text-tertiary, #999)', fontSize: 12 }}>
              {t('total')} {filtered.length} {t('records')}
            </Text>
          </Space>
        </div>
      )}

      {/* View article */}
      <Modal
        title={<Space>{categoryConfig[viewing?.category]?.emoji} {viewing?.title}</Space>}
        open={viewOpen}
        onCancel={() => setViewOpen(false)}
        footer={null}
        width={720}
      >
        {viewing && (
          <div>
            <Space style={{ marginBottom: 12 }} wrap>
              <Tag color={categoryConfig[viewing.category]?.color}>{categoryConfig[viewing.category]?.emoji} {t(viewing.category)}</Tag>
              {viewing.alert_name && <Tag color="volcano">{viewing.alert_name}</Tag>}
              {viewing.severity && <Tag>{viewing.severity}</Tag>}
              {viewing.tags?.split(',').filter(Boolean).map((tag: string) => (
                <Tag key={tag.trim()}>{tag.trim()}</Tag>
              ))}
            </Space>
            <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)' }}>
              {viewing.author || 'system'} · {new Date(viewing.updated_at).toLocaleString()}
            </div>
            <div style={{
              whiteSpace: 'pre-wrap', lineHeight: 1.8, padding: 16, borderRadius: 8,
              background: 'var(--ant-color-bg-text-active, rgba(0,0,0,0.06))',
              border: '1px solid var(--ant-color-border, #d9d9d9)',
              color: 'var(--ant-color-text, #333)',
              maxHeight: 500, overflow: 'auto',
            }}>
              {viewing.content}
            </div>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)' }}><EyeOutlined /> {viewing.view_count || 0}</span>
                <Button icon={<LikeOutlined />} onClick={() => handleHelpful(viewing.id)}>{t('helpful')} ({viewing.helpful_count || 0})</Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>

      {/* Create/Edit article */}
      <Modal
        title={editing ? t('editArticle') : t('addArticle')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        width={650}
        destroyOnClose
      >
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="title" label={t('title')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="category" label={t('category')} style={{ width: '50%' }}>
              <Select options={catOptions} />
            </Form.Item>
            <Form.Item name="alert_name" label={t('alertName')} style={{ width: '50%' }}>
              <Input placeholder={t('optional')} />
            </Form.Item>
          </Space>
          <Form.Item name="tags" label={t('tags')}>
            <Input placeholder="tag1,tag2,..." />
          </Form.Item>
          <Form.Item name="content" label={t('content')} rules={[{ required: true }]}>
            <TextArea rows={12} placeholder={t('markdownSupported') || 'Markdown supported'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default KnowledgeBase;
