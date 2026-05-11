import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Modal, Form, Input, Select, Switch, Space, Tag, message, Popconfirm, Progress, Tooltip, InputNumber, Empty, Badge, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined, PlayCircleOutlined,
  ReloadOutlined, HddOutlined, ApiOutlined, CodeOutlined, SafetyCertificateOutlined,
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useLanguage } from '../services/i18n';
import { getRemediationTemplates, createRemediationTemplate, updateRemediationTemplate, deleteRemediationTemplate } from '../services/api';

const { TextArea } = Input;

const categoryConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  restart: { icon: <ReloadOutlined />, color: '#fa8c16', bg: '#fff7e6' },
  disk: { icon: <HddOutlined />, color: '#722ed1', bg: '#f9f0ff' },
  network: { icon: <ApiOutlined />, color: '#13c2c2', bg: '#e6fffb' },
  service: { icon: <SafetyCertificateOutlined />, color: '#1890ff', bg: '#e6f7ff' },
  general: { icon: <CodeOutlined />, color: '#595959', bg: '#fafafa' },
};

const riskConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  low: { color: '#52c41a', label: '🟢 低风险', icon: <CheckCircleOutlined /> },
  medium: { color: '#faad14', label: '🟡 中风险', icon: <WarningOutlined /> },
  high: { color: '#ff4d4f', label: '🔴 高风险', icon: <CloseCircleOutlined /> },
};

const RemediationTemplates: React.FC = () => {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewing, setViewing] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [searchText, setSearchText] = useState('');
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
      const labelsArr = Object.entries(ml).map(([k, v]) => ({ key: k, value: v as string }));
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

  const showDetail = (tmpl: any) => {
    setViewing(tmpl);
    setDetailOpen(true);
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

  const getSuccessRate = (v: string) => {
    try { const [c, total] = v.split('/').map(Number); return total > 0 ? Math.round(c / total * 100) : 0; } catch { return 0; }
  };

  // Filter templates
  const filtered = templates.filter(tmpl => {
    if (filterCategory && tmpl.category !== filterCategory) return false;
    if (searchText && !tmpl.name.toLowerCase().includes(searchText.toLowerCase()) && !(tmpl.match_keywords || '').toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  // Group by category
  const grouped: Record<string, any[]> = {};
  filtered.forEach(tmpl => {
    const cat = tmpl.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(tmpl);
  });

  const renderConfigPreview = (configTemplate: string) => {
    try {
      const obj = JSON.parse(configTemplate);
      if (obj.command) return <code style={{ fontSize: 11, background: 'var(--ant-color-bg-text-active, rgba(0,0,0,0.06))', color: 'var(--ant-color-text-secondary, #666)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--ant-color-border, #d9d9d9)' }}>{obj.command}</code>;
      if (obj.url) return <code style={{ fontSize: 11, background: 'var(--ant-color-bg-text-active, rgba(0,0,0,0.06))', color: 'var(--ant-color-text-secondary, #666)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--ant-color-border, #d9d9d9)' }}>{obj.method || 'GET'} {obj.url}</code>;
      return <code style={{ fontSize: 11, background: 'var(--ant-color-bg-text-active, rgba(0,0,0,0.06))', color: 'var(--ant-color-text-secondary, #666)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--ant-color-border, #d9d9d9)' }}>{JSON.stringify(obj).slice(0, 60)}</code>;
    } catch { return <code style={{ fontSize: 11, background: 'var(--ant-color-bg-text-active, rgba(0,0,0,0.06))', color: 'var(--ant-color-text-secondary, #666)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--ant-color-border, #d9d9d9)' }}>{configTemplate.slice(0, 60)}</code>; }
  };

  return (
    <div>
      {/* Header with filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Input.Search
            placeholder={t('searchKnowledge')}
            style={{ width: 220 }}
            onSearch={setSearchText}
            onChange={e => !e.target.value && setSearchText('')}
            allowClear
          />
          <Select
            allowClear
            placeholder={t('category')}
            style={{ width: 130 }}
            onChange={setFilterCategory}
            options={Object.entries(categoryConfig).map(([k, v]) => ({ label: <span>{v.icon} {t(k)}</span>, value: k }))}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>{t('addTemplate')}</Button>
      </div>

      {/* Stats summary */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" bordered={false} style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--ant-color-text-secondary)' }}>{t('totalAlerts')}</span>
              <Badge count={templates.length} style={{ backgroundColor: '#1890ff' }} />
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bordered={false} style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--ant-color-text-secondary)' }}>{t('active')}</span>
              <Badge count={templates.filter(t => t.is_active).length} style={{ backgroundColor: '#52c41a' }} />
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bordered={false} style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--ant-color-text-secondary)' }}>{t('autoExecute')}</span>
              <Badge count={templates.filter(t => !t.requires_approval).length} style={{ backgroundColor: '#faad14' }} />
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bordered={false} style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--ant-color-text-secondary)' }}>{t('builtIn')}</span>
              <Badge count={8} style={{ backgroundColor: '#722ed1' }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Card grid grouped by category */}
      {Object.entries(grouped).length === 0 && <Empty description={t('noData')} />}

      {Object.entries(grouped).map(([cat, items]) => {
        const cfg = categoryConfig[cat] || categoryConfig.general;
        return (
          <div key={cat} style={{ marginBottom: 20 }}>
            <Divider orientation="left" style={{ marginTop: 0, marginBottom: 12, fontSize: 14, color: cfg.color }}>
              {cfg.icon} {t(cat)} ({items.length})
            </Divider>
            <Row gutter={[12, 12]}>
              {items.map(tmpl => {
                const rate = getSuccessRate(tmpl.success_rate);
                const risk = riskConfig[tmpl.risk_level] || riskConfig.medium;
                const isActive = tmpl.is_active;
                return (
                  <Col key={tmpl.id} xs={24} sm={12} md={8} lg={6}>
                    <Card
                      size="small"
                      hoverable
                      style={{
                        borderColor: isActive ? undefined : '#d9d9d9',
                        opacity: isActive ? 1 : 0.65,
                        borderLeft: `3px solid ${cfg.color}`,
                      }}
                      bodyStyle={{ padding: '12px 14px' }}
                    >
                      {/* Title row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tmpl.name}</div>
                          {tmpl.description && <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary, #999)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tmpl.description}</div>}
                        </div>
                        <Space size={4}>
                          <Tooltip title={t('detail')}><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => showDetail(tmpl)} /></Tooltip>
                          <Tooltip title={t('editTemplate')}><Button size="small" type="text" icon={<EditOutlined />} onClick={() => showModal(tmpl)} /></Tooltip>
                          <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete(tmpl.id)}>
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      </div>

                      {/* Config preview */}
                      <div style={{ marginBottom: 8 }}>
                        {renderConfigPreview(tmpl.config_template)}
                      </div>

                      {/* Tags row */}
                      <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <Tag color={cfg.color} style={{ margin: 0 }}>{t(cat)}</Tag>
                        <Tag style={{ margin: 0 }}>{tmpl.action_type}</Tag>
                        <Tag color={risk.color} style={{ margin: 0 }}>{risk.label}</Tag>
                        {!tmpl.requires_approval && <Tag color="green" style={{ margin: 0 }}>⚡ {t('autoExecute')}</Tag>}
                      </div>

                      {/* Match keywords */}
                      {tmpl.match_keywords && (
                        <div style={{ marginBottom: 6 }}>
                          {tmpl.match_keywords.split(',').slice(0, 4).map((kw: string) => (
                            <Tag key={kw} style={{ fontSize: 10, margin: '0 2px 2px 0' }}>{kw.trim()}</Tag>
                          ))}
                        </div>
                      )}

                      {/* Success rate bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Progress
                          percent={rate}
                          size="small"
                          strokeColor={rate >= 80 ? '#52c41a' : rate >= 50 ? '#faad14' : '#ff4d4f'}
                          style={{ flex: 1, marginBottom: 0 }}
                          format={() => ''}
                        />
                        <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary, #999)', whiteSpace: 'nowrap' }}>
                          {tmpl.success_rate} · {t('usageCount')}: {tmpl.usage_count || 0}
                        </span>
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </div>
        );
      })}

      {/* Detail modal */}
      <Modal
        title={viewing?.name}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Space><Button onClick={() => { setDetailOpen(false); showModal(viewing); }}>{t('editTemplate')}</Button><Button onClick={() => setDetailOpen(false)}>{t('close')}</Button></Space>}
        width={600}
      >
        {viewing && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Space wrap>
                <Tag color={(categoryConfig[viewing.category] || categoryConfig.general).color}>{t(viewing.category)}</Tag>
                <Tag>{viewing.action_type}</Tag>
                <Tag color={(riskConfig[viewing.risk_level] || riskConfig.medium).color}>{(riskConfig[viewing.risk_level] || riskConfig.medium).label}</Tag>
                {viewing.requires_approval ? <Tag color="orange">{t('requiresApproval')}</Tag> : <Tag color="green">⚡ {t('autoExecute')}</Tag>}
                {viewing.is_active ? <Tag color="green">{t('active')}</Tag> : <Tag>{t('inactive')}</Tag>}
              </Space>
            </div>
            {viewing.description && <p style={{ color: 'var(--ant-color-text-secondary, #666)', margin: '8px 0' }}>{viewing.description}</p>}

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('configTemplate')}</div>
              <pre style={{ background: 'var(--ant-color-bg-text-active, rgba(0,0,0,0.06))', color: 'var(--ant-color-text, #333)', padding: 12, borderRadius: 6, fontSize: 12, overflow: 'auto', border: '1px solid var(--ant-color-border, #d9d9d9)' }}>
                {(() => { try { return JSON.stringify(JSON.parse(viewing.config_template), null, 2); } catch { return viewing.config_template; } })()}
              </pre>
            </div>

            <Row gutter={16}>
              <Col span={12}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('matchLabels')}</div>
                {(() => { const ml = JSON.parse(viewing.match_labels || '{}'); return Object.keys(ml).length ? Object.entries(ml).map(([k, v]) => <Tag key={k}>{k}={v as string}</Tag>) : <span style={{ color: 'var(--ant-color-text-tertiary, #999)' }}>-</span>; })()}
              </Col>
              <Col span={12}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('matchKeywords')}</div>
                {viewing.match_keywords ? viewing.match_keywords.split(',').map((kw: string) => <Tag key={kw}>{kw.trim()}</Tag>) : <span style={{ color: 'var(--ant-color-text-tertiary, #999)' }}>-</span>}
              </Col>
            </Row>

            {viewing.match_severity && <div style={{ marginTop: 8 }}><span style={{ fontWeight: 600 }}>{t('matchSeverity')}: </span>{viewing.match_severity}</div>}

            <Divider style={{ margin: '12px 0' }} />
            <Row gutter={16}>
              <Col span={8}><Statistic title={t('usageCount')} value={viewing.usage_count || 0} /></Col>
              <Col span={8}><Statistic title={t('successRate')} value={viewing.success_rate || '0/0'} /></Col>
              <Col span={8}>
                <Progress type="circle" percent={getSuccessRate(viewing.success_rate)} size={60}
                  strokeColor={getSuccessRate(viewing.success_rate) >= 80 ? '#52c41a' : '#faad14'} />
              </Col>
            </Row>
          </div>
        )}
      </Modal>

      {/* Create/Edit modal */}
      <Modal title={editing ? t('editTemplate') : t('addTemplate')} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} width={680} destroyOnClose>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Row gutter={12}>
            <Col span={12}><Form.Item name="name" label={t('ruleName')} rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={6}>
              <Form.Item name="category" label={t('category')}>
                <Select options={Object.entries(categoryConfig).map(([k, v]) => ({ label: <span>{v.icon} {t(k)}</span>, value: k }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="action_type" label={t('actionType')}>
                <Select options={[{ label: '🖥 Shell', value: 'shell' }, { label: '🌐 HTTP', value: 'http' }, { label: '🔗 Webhook', value: 'webhook' }, { label: '📜 Script', value: 'script' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label={t('description')}><Input /></Form.Item>
          <Form.Item name="config_template" label={t('configTemplate')} extra={<span style={{ color: '#1890ff' }}>💡 {t('placeholderHint')}</span>} rules={[{ required: true }]}>
            <TextArea rows={4} placeholder={'{\n  "command": "systemctl restart {{service_name}}"\n}'} style={{ fontFamily: 'monospace' }} />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 12, margin: '8px 0 16px' }}>🎯 {t('matchRules') || '匹配规则'}</Divider>

          <Form.Item label={t('matchLabels')}>
            <Form.List name="match_labels">
              {(fields, { add, remove }) => <>
                {fields.map(({ key, name, ...rest }) => <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item {...rest} name={[name, 'key']} rules={[{ required: true }]}><Input placeholder={t('labelKey')} style={{ width: 130 }} /></Form.Item>
                  <Form.Item {...rest} name={[name, 'value']}><Input placeholder={t('labelValue')} style={{ width: 130 }} /></Form.Item>
                  <Button onClick={() => remove(name)} danger size="small" icon={<DeleteOutlined />} />
                </Space>)}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>{t('addLabel')}</Button>
              </>}
            </Form.List>
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="match_severity" label={t('matchSeverity')}>
                <Select mode="multiple" options={[{ label: '🔴 Critical', value: 'critical' }, { label: '🟠 High', value: 'high' }, { label: '🟡 Warning', value: 'warning' }, { label: '🔵 Info', value: 'info' }]} placeholder={t('matchAll')} allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="match_keywords" label={t('matchKeywords')}>
                <Input placeholder="关键词1,关键词2,..." />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ fontSize: 12, margin: '8px 0 16px' }}>⚙️ {t('executionSettings') || '执行设置'}</Divider>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="risk_level" label={t('riskLevel')}>
                <Select options={[{ label: '🟢 Low', value: 'low' }, { label: '🟡 Medium', value: 'medium' }, { label: '🔴 High', value: 'high' }]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="requires_approval" label={t('requiresApproval')} valuePropName="checked">
                <Switch checkedChildren="🔒" unCheckedChildren="⚡" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="is_active" label={t('isActive')} valuePropName="checked">
                <Switch checkedChildren="✅" unCheckedChildren="⏸" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default RemediationTemplates;
