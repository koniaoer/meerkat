import React, { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Space, Select, Modal, Descriptions, message, Popconfirm, Card, Row, Col, Statistic, Tooltip, Input } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined, ExclamationCircleOutlined, SafetyCertificateOutlined,
  DeleteOutlined, SearchOutlined, ThunderboltOutlined, ClockCircleOutlined,
  RobotOutlined, ToolOutlined, EyeOutlined } from '@ant-design/icons';
import { getRemediationActions, approveRemediationAction, executeRemediationAction,
  deleteRemediationAction, batchDeleteRemediationActions } from '../services/api';
import { useLanguage } from '../services/i18n';

const statusConfig: Record<string, { color: string; emoji: string }> = {
  pending: { color: 'orange', emoji: '⏳' },
  approved: { color: 'blue', emoji: '✅' },
  executing: { color: 'cyan', emoji: '⚡' },
  completed: { color: 'green', emoji: '✅' },
  failed: { color: 'red', emoji: '❌' },
  rejected: { color: 'default', emoji: '🚫' },
  timeout: { color: 'volcano', emoji: '⏰' },
};

const riskConfig: Record<string, { color: string; emoji: string }> = {
  low: { color: 'green', emoji: '🟢' },
  medium: { color: 'orange', emoji: '🟡' },
  high: { color: 'red', emoji: '🔴' },
};

const typeIconMap: Record<string, { label: string; color: string }> = {
  shell: { label: 'Shell', color: '#52c41a' },
  http: { label: 'HTTP', color: '#1890ff' },
  webhook: { label: 'Webhook', color: '#722ed1' },
  script: { label: 'Script', color: '#fa8c16' },
};

const RemediationActions: React.FC = () => {
  const { t } = useLanguage();
  const [allActions, setAllActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{ status?: string; risk_level?: string }>({});
  const [stats, setStats] = useState({ pending: 0, completed: 0, failed: 0, total: 0 });
  const [detailModal, setDetailModal] = useState<any>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [searchText, setSearchText] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });

  // Filtered actions derived from allActions + filters + search
  const actions = React.useMemo(() => {
    let filtered = allActions;
    if (filters.status) {
      filtered = filtered.filter((a: any) => a.status === filters.status);
    }
    if (filters.risk_level) {
      filtered = filtered.filter((a: any) => a.risk_level === filters.risk_level);
    }
    if (searchText) {
      const lower = searchText.toLowerCase();
      filtered = filtered.filter((a: any) =>
        a.name?.toLowerCase().includes(lower) || a.description?.toLowerCase().includes(lower)
      );
    }
    return filtered;
  }, [allActions, filters, searchText]);

  const fetchActions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRemediationActions({});
      const all = res.data;
      setAllActions(all);
      setStats({
        pending: all.filter((a: any) => a.status === 'pending').length,
        completed: all.filter((a: any) => a.status === 'completed').length,
        failed: all.filter((a: any) => ['failed', 'timeout'].includes(a.status)).length,
        total: all.length,
      });
    } catch (error) {
      console.error('Failed to fetch actions', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActions();
    const interval = setInterval(fetchActions, 15000);
    return () => clearInterval(interval);
  }, [fetchActions]);

  const handleApprove = async (id: number) => {
    try { await approveRemediationAction(id, true); message.success(t('actionApproved')); fetchActions(); }
    catch { message.error(t('failed')); }
  };

  const handleReject = async (id: number) => {
    try { await approveRemediationAction(id, false); message.success(t('actionRejected')); fetchActions(); }
    catch { message.error(t('failed')); }
  };

  const handleExecute = async (id: number) => {
    try { await executeRemediationAction(id); message.success(t('actionExecuted')); fetchActions(); }
    catch { message.error(t('failed')); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteRemediationAction(id); message.success(t('deleted')); fetchActions(); setSelectedRowKeys(prev => prev.filter(k => k !== id)); }
    catch { message.error(t('failed')); }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      await batchDeleteRemediationActions(selectedRowKeys);
      message.success(`${t('deleted')} ${selectedRowKeys.length} ${t('records')}`);
      setSelectedRowKeys([]);
      fetchActions();
    } catch { message.error(t('failed')); }
  };

  const showDetail = (record: any) => { setDetailModal(record); };

  const columns = [
    {
      title: t('time'), dataIndex: 'created_at', key: 'created_at', width: 155,
      render: (text: string) => <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary, #666)' }}>{new Date(text).toLocaleString()}</span>,
    },
    {
      title: t('actionName'), dataIndex: 'name', key: 'name', ellipsis: true,
      render: (text: string, record: any) => (
        <a onClick={() => showDetail(record)} style={{ fontWeight: 500 }}>
          {record.auto_approved && <Tooltip title="自动执行"><RobotOutlined style={{ color: '#1890ff', marginRight: 4 }} /></Tooltip>}
          {text}
        </a>
      ),
    },
    {
      title: t('actionType'), dataIndex: 'action_type', key: 'action_type', width: 95,
      render: (type: string) => {
        const cfg = typeIconMap[type] || { label: type, color: '#999' };
        return <Tag style={{ margin: 0, color: cfg.color, borderColor: cfg.color }}>{cfg.label}</Tag>;
      },
    },
    {
      title: t('riskLevel'), dataIndex: 'risk_level', key: 'risk_level', width: 85,
      render: (risk: string) => {
        const cfg = riskConfig[risk] || { color: 'default', emoji: '' };
        return <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.emoji} {risk?.toUpperCase() || '-'}</Tag>;
      },
    },
    {
      title: t('status'), dataIndex: 'status', key: 'status', width: 105,
      render: (status: string) => {
        const cfg = statusConfig[status] || { color: 'default', emoji: '' };
        return <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.emoji} {status?.toUpperCase()}</Tag>;
      },
    },
    {
      title: t('actions'), key: 'actions', width: 240,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Tooltip title={t('detail')}><Button size="small" type="text" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); showDetail(record); }} /></Tooltip>
          {record.status === 'pending' && (
            <>
              <Popconfirm title={t('confirmApproveAction')} onConfirm={() => handleApprove(record.id)}>
                <Button size="small" type="primary" icon={<CheckOutlined />}>{t('approve')}</Button>
              </Popconfirm>
              <Popconfirm title={t('confirmRejectAction')} onConfirm={() => handleReject(record.id)}>
                <Button size="small" danger icon={<CloseOutlined />}>{t('reject')}</Button>
              </Popconfirm>
            </>
          )}
          {['completed', 'failed', 'timeout'].includes(record.status) && (
            <Popconfirm title={t('confirmReExecute')} onConfirm={() => handleExecute(record.id)}>
              <Button size="small" icon={<ReloadOutlined />}>{t('reExecute')}</Button>
            </Popconfirm>
          )}
          <Popconfirm title={t('confirmDeleteAction')} onConfirm={() => handleDelete(record.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title={t('totalActions')} value={stats.total} prefix={<ExclamationCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title={t('pendingActions')} value={stats.pending} valueStyle={{ color: stats.pending > 0 ? '#fa8c16' : '#52c41a' }} prefix={<ClockCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title={t('completedActions')} value={stats.completed} valueStyle={{ color: '#52c41a' }} prefix={<CheckOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title={t('failedActions')} value={stats.failed} valueStyle={{ color: stats.failed > 0 ? '#cf1322' : '#52c41a' }} prefix={<CloseOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* Filters + Actions */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }} align="middle">
        <Col>
          <Input
            prefix={<SearchOutlined />}
            placeholder={t('searchNameDesc')}
            allowClear
            style={{ width: 200 }}
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setPagination(p => ({ ...p, current: 1 })); }}
          />
        </Col>
        <Col>
          <Select allowClear placeholder={t('statusFilter')} style={{ width: 130 }} onChange={(val) => { setFilters({ ...filters, status: val }); setPagination(p => ({ ...p, current: 1 })); }} value={filters.status}
            options={[
              { value: 'pending', label: `⏳ ${t('pending')}` }, { value: 'approved', label: `✅ ${t('approved')}` },
              { value: 'executing', label: `⚡ ${t('executing')}` }, { value: 'completed', label: `✅ ${t('completed')}` },
              { value: 'failed', label: `❌ ${t('failed')}` }, { value: 'rejected', label: `🚫 ${t('rejected')}` },
              { value: 'timeout', label: `⏰ ${t('timeout')}` },
            ]}
          />
        </Col>
        <Col>
          <Select allowClear placeholder={t('riskLevelFilter')} style={{ width: 130 }} onChange={(val) => { setFilters({ ...filters, risk_level: val }); setPagination(p => ({ ...p, current: 1 })); }} value={filters.risk_level}
            options={[
              { value: 'low', label: `🟢 ${t('low')}` }, { value: 'medium', label: `🟡 ${t('medium')}` }, { value: 'high', label: `🔴 ${t('high')}` },
            ]}
          />
        </Col>
        <Col flex="auto" />
        {selectedRowKeys.length > 0 && (
          <Col>
            <Popconfirm title={`${t('confirmBatchDelete')} ${selectedRowKeys.length} ${t('records')}？`} onConfirm={handleBatchDelete}>
              <Button danger icon={<DeleteOutlined />}>{t('batchDelete')} ({selectedRowKeys.length})</Button>
            </Popconfirm>
          </Col>
        )}
      </Row>

      {/* Table */}
      <Table
        dataSource={actions}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as number[]),
        }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showTotal: (total) => `${t('total')} ${total} ${t('records')}`,
          onChange: (page, size) => setPagination({ current: page, pageSize: size }),
          onShowSizeChange: (current, size) => setPagination({ current: 1, pageSize: size }),
        }}
      />

      {/* Detail Modal */}
      <Modal
        open={!!detailModal}
        title={<Space><ToolOutlined />{detailModal?.name || t('actionDetail')}</Space>}
        onCancel={() => setDetailModal(null)}
        footer={null}
        width={680}
      >
        {detailModal && (
          <div>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label={t('actionName')}>{detailModal.name}</Descriptions.Item>
              <Descriptions.Item label={t('actionType')}>
                <Tag color={typeIconMap[detailModal.action_type]?.color}>{typeIconMap[detailModal.action_type]?.label || detailModal.action_type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('riskLevel')}>
                <Tag color={riskConfig[detailModal.risk_level]?.color}>{riskConfig[detailModal.risk_level]?.emoji} {detailModal.risk_level?.toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('status')}>
                <Tag color={statusConfig[detailModal.status]?.color}>{statusConfig[detailModal.status]?.emoji} {detailModal.status?.toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('description')} span={2}>{detailModal.description || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('autoApproved')}>{detailModal.auto_approved ? '✅ Auto' : '⏳ Manual'}</Descriptions.Item>
              <Descriptions.Item label={t('approvedBy')}>{detailModal.approved_by || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('config')} span={2}>
                <pre style={{
                  maxHeight: 200, overflow: 'auto', padding: 8, borderRadius: 4, fontSize: 12,
                  background: 'var(--ant-color-bg-text-active, rgba(0,0,0,0.06))',
                  border: '1px solid var(--ant-color-border, #d9d9d9)',
                  color: 'var(--ant-color-text, #333)',
                }}>
                  {(() => { try { return JSON.stringify(JSON.parse(detailModal.config), null, 2); } catch { return detailModal.config; } })()}
                </pre>
              </Descriptions.Item>
              {detailModal.result && (
                <Descriptions.Item label={t('result')} span={2}>
                  <pre style={{
                    maxHeight: 200, overflow: 'auto', padding: 8, borderRadius: 4, fontSize: 12,
                    background: 'var(--ant-color-bg-text-active, rgba(0,0,0,0.06))',
                    border: '1px solid var(--ant-color-border, #d9d9d9)',
                    color: 'var(--ant-color-text, #333)',
                  }}>
                    {(() => { try { return JSON.stringify(JSON.parse(detailModal.result), null, 2); } catch { return detailModal.result; } })()}
                  </pre>
                </Descriptions.Item>
              )}
            </Descriptions>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                {detailModal.status === 'pending' && (
                  <>
                    <Button type="primary" icon={<CheckOutlined />} onClick={() => { handleApprove(detailModal.id); setDetailModal(null); }}>{t('approve')}</Button>
                    <Button danger icon={<CloseOutlined />} onClick={() => { handleReject(detailModal.id); setDetailModal(null); }}>{t('reject')}</Button>
                  </>
                )}
                {['completed', 'failed', 'timeout'].includes(detailModal.status) && (
                  <Button icon={<ReloadOutlined />} onClick={() => { handleExecute(detailModal.id); setDetailModal(null); }}>{t('reExecute')}</Button>
                )}
                <Popconfirm title={t('confirmDeleteAction')} onConfirm={() => { handleDelete(detailModal.id); setDetailModal(null); }}>
                  <Button danger icon={<DeleteOutlined />}>{t('delete')}</Button>
                </Popconfirm>
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default RemediationActions;
