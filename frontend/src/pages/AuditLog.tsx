import React, { useState, useEffect, useCallback } from 'react';
import { Table, Select, Tag, Space, Input, Card, Row, Col, Statistic, Button, Tooltip, Popconfirm, message } from 'antd';
import { DeleteOutlined, SearchOutlined, ReloadOutlined, SafetyCertificateOutlined, PlusCircleOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useLanguage } from '../services/i18n';
import { getAuditLogs, deleteAuditLog, batchDeleteAuditLogs } from '../services/api';

const AuditLog: React.FC = () => {
  const { t } = useLanguage();
  const [allLogs, setAllLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [pageState, setPageState] = useState({ current: 1, pageSize: 20 });

  // Filtered logs derived from allLogs + filters + search
  const logs = React.useMemo(() => {
    let filtered = allLogs;
    if (actionFilter) filtered = filtered.filter((l: any) => l.action === actionFilter);
    if (typeFilter) filtered = filtered.filter((l: any) => l.resource_type === typeFilter);
    if (searchText) {
      const lower = searchText.toLowerCase();
      filtered = filtered.filter((l: any) =>
        l.username?.toLowerCase().includes(lower) ||
        l.action?.toLowerCase().includes(lower) ||
        l.detail?.toLowerCase().includes(lower)
      );
    }
    return filtered;
  }, [allLogs, actionFilter, typeFilter, searchText]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs({});
      setAllLogs(res.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadLogs(); }, []);

  const handleDelete = async (id: number) => {
    try { await deleteAuditLog(id); message.success('已删除'); loadLogs(); setSelectedRowKeys(prev => prev.filter(k => k !== id)); }
    catch { message.error(t('failed')); }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      await batchDeleteAuditLogs(selectedRowKeys);
      message.success(`已删除 ${selectedRowKeys.length} 条日志`);
      setSelectedRowKeys([]);
      loadLogs();
    } catch { message.error(t('failed')); }
  };

  const actionColor = (action: string) => {
    if (action.includes('delete') || action.includes('suppress')) return 'red';
    if (action.includes('create')) return 'green';
    if (action.includes('update')) return 'blue';
    if (action.includes('approve') || action.includes('apply')) return 'cyan';
    if (action.includes('acknowledge')) return 'geekblue';
    if (action.includes('silence')) return 'orange';
    if (action.includes('escalat')) return 'volcano';
    return 'default';
  };

  const actionLabel = (action: string) => {
    const map: Record<string, string> = {
      'alert.acknowledge': '✓ 确认', 'alert.silence': '🔇 静默', 'alert.suppressed': '🚫 抑制',
      'alert.delete': '🗑️ 删除告警', 'alert.batch_delete': '🗑️ 批量删除告警',
      'routing_rule.create': '➕ 路由创建', 'routing_rule.update': '✏️ 路由更新', 'routing_rule.delete': '🗑️ 路由删除',
      'suppression_rule.create': '➕ 抑制创建', 'suppression_rule.update': '✏️ 抑制更新', 'suppression_rule.delete': '🗑️ 抑制删除',
      'template.create': '➕ 模板创建', 'template.update': '✏️ 模板更新', 'template.delete': '🗑️ 模板删除', 'template.apply': '▶️ 模板应用',
      'remediation_action.delete': '🗑️ 动作删除', 'remediation_action.batch_delete': '🗑️ 批量删除动作',
      'escalation.triggered': '⬆️ 升级触发', 'escalation.escalated': '⬆️ 升级执行',
      'notification_channel.create': '➕ 通道创建', 'notification_channel.update': '✏️ 通道更新', 'notification_channel.delete': '🗑️ 通道删除',
    };
    return map[action] || action;
  };

  const resourceTypeIcon: Record<string, string> = {
    alert: '🔔', routing_rule: '🔀', suppression_rule: '🚫', remediation_template: '🔧',
    remediation_action: '⚡', escalation: '⬆️', notification_channel: '📡',
  };

  const columns = [
    {
      title: t('time'), dataIndex: 'created_at', key: 'time', width: 160,
      render: (v: string) => <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary, #666)' }}>{new Date(v).toLocaleString()}</span>,
      sorter: (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: t('operator'), dataIndex: 'username', key: 'user', width: 90,
      render: (v: string) => <Tag>{v || 'system'}</Tag>,
    },
    {
      title: t('actionType'), dataIndex: 'action', key: 'action', width: 150,
      render: (v: string) => <Tag color={actionColor(v)}>{actionLabel(v)}</Tag>,
    },
    {
      title: t('resourceType'), dataIndex: 'resource_type', key: 'rt', width: 140,
      render: (v: string) => <Tag color="processing">{resourceTypeIcon[v] || '📄'} {v}</Tag>,
    },
    {
      title: 'ID', dataIndex: 'resource_id', key: 'ri', width: 60,
    },
    {
      title: t('detail'), dataIndex: 'detail', key: 'detail', ellipsis: true,
      render: (v: string) => {
        if (!v) return '-';
        try {
          const obj = JSON.parse(v);
          return <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{Object.entries(obj).map(([k, val]) => `${k}=${val}`).join(', ')}</span>;
        } catch { return <span style={{ fontSize: 11 }}>{v}</span>; }
      },
    },
    {
      title: '', key: 'op', width: 40,
      render: (_: any, r: any) => (
        <Popconfirm title="确定删除此日志？" onConfirm={() => handleDelete(r.id)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const actionTypes = [
    { label: '✓ 确认告警', value: 'alert.acknowledge' },
    { label: '🔇 静默告警', value: 'alert.silence' },
    { label: '🚫 抑制告警', value: 'alert.suppressed' },
    { label: '🗑️ 删除告警', value: 'alert.delete' },
    { label: '🗑️ 批量删除告警', value: 'alert.batch_delete' },
    { label: '➕ 路由创建', value: 'routing_rule.create' },
    { label: '✏️ 路由更新', value: 'routing_rule.update' },
    { label: '🗑️ 路由删除', value: 'routing_rule.delete' },
    { label: '➕ 抑制创建', value: 'suppression_rule.create' },
    { label: '✏️ 抑制更新', value: 'suppression_rule.update' },
    { label: '🗑️ 抑制删除', value: 'suppression_rule.delete' },
    { label: '➕ 模板创建', value: 'template.create' },
    { label: '✏️ 模板更新', value: 'template.update' },
    { label: '🗑️ 模板删除', value: 'template.delete' },
    { label: '▶️ 模板应用', value: 'template.apply' },
    { label: '⬆️ 升级触发', value: 'escalation.triggered' },
  ];

  const resourceTypes = [
    { label: '🔔 Alert', value: 'alert' },
    { label: '🔀 Routing Rule', value: 'routing_rule' },
    { label: '🚫 Suppression Rule', value: 'suppression_rule' },
    { label: '🔧 Remediation Template', value: 'remediation_template' },
    { label: '⚡ Remediation Action', value: 'remediation_action' },
    { label: '⬆️ Escalation', value: 'escalation' },
    { label: '📡 Notification Channel', value: 'notification_channel' },
  ];

  // Stats derived from allLogs
  const statsByAction = allLogs.reduce((acc: any, l: any) => { acc[l.action] = (acc[l.action] || 0) + 1; return acc; }, {});
  const ackCount = Object.entries(statsByAction).filter(([k]) => k.includes('acknowledge')).reduce((a: number, [, v]: any) => a + v, 0);
  const createCount = Object.entries(statsByAction).filter(([k]) => k.includes('create')).reduce((a: number, [, v]: any) => a + v, 0);
  const deleteCount = Object.entries(statsByAction).filter(([k]) => k.includes('delete')).reduce((a: number, [, v]: any) => a + v, 0);

  return (
    <div>
      {/* Quick stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title={t('totalActions')} value={allLogs.length} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title={t('completed')} value={ackCount} valueStyle={{ color: '#52c41a' }} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title="Create" value={createCount} valueStyle={{ color: '#1890ff' }} prefix={<PlusCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title="Delete" value={deleteCount} valueStyle={{ color: '#ff4d4f' }} prefix={<MinusCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }} align="middle">
        <Col>
          <Input prefix={<SearchOutlined />} placeholder="搜索用户/操作/详情" allowClear style={{ width: 200 }}
            value={searchText} onChange={e => { setSearchText(e.target.value); setPageState(p => ({ ...p, current: 1 })); }} />
        </Col>
        <Col>
          <Select allowClear placeholder={t('actionType')} style={{ width: 180 }} options={actionTypes}
            onChange={(v) => { setActionFilter(v); setPageState(p => ({ ...p, current: 1 })); }} />
        </Col>
        <Col>
          <Select allowClear placeholder={t('resourceType')} style={{ width: 180 }} options={resourceTypes}
            onChange={(v) => { setTypeFilter(v); setPageState(p => ({ ...p, current: 1 })); }} />
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={loadLogs}>{t('refresh')}</Button>
        </Col>
        <Col flex="auto" />
        {selectedRowKeys.length > 0 && (
          <Col>
            <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 条日志？`} onConfirm={handleBatchDelete}>
              <Button danger icon={<DeleteOutlined />}>批量删除 ({selectedRowKeys.length})</Button>
            </Popconfirm>
          </Col>
        )}
      </Row>

      <Table
        dataSource={logs}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as number[]),
        }}
        pagination={{
          current: pageState.current,
          pageSize: pageState.pageSize,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (page, size) => setPageState({ current: page, pageSize: size }),
          onShowSizeChange: (current, size) => setPageState({ current: 1, pageSize: size }),
        }}
      />
    </div>
  );
};

export default AuditLog;
