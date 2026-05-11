import React, { useState, useEffect, useCallback } from 'react';
import { Table, Select, Tag, Space, Input, Card, Row, Col, Statistic, Button, Popconfirm, message } from 'antd';
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
    try { await deleteAuditLog(id); message.success(t('deleted')); loadLogs(); setSelectedRowKeys(prev => prev.filter(k => k !== id)); }
    catch { message.error(t('failed')); }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      await batchDeleteAuditLogs(selectedRowKeys);
      message.success(`${t('deleted')} ${selectedRowKeys.length} ${t('records')}`);
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

  const actionLabelMap: Record<string, string> = {
    'alert.acknowledge': 'audit.acknowledge', 'alert.silence': 'audit.silence', 'alert.suppressed': 'audit.suppressed',
    'alert.delete': 'audit.alertDelete', 'alert.batch_delete': 'audit.alertBatchDelete',
    'routing_rule.create': 'audit.routingCreate', 'routing_rule.update': 'audit.routingUpdate', 'routing_rule.delete': 'audit.routingDelete',
    'suppression_rule.create': 'audit.suppressionCreate', 'suppression_rule.update': 'audit.suppressionUpdate', 'suppression_rule.delete': 'audit.suppressionDelete',
    'template.create': 'audit.templateCreate', 'template.update': 'audit.templateUpdate', 'template.delete': 'audit.templateDelete', 'template.apply': 'audit.templateApply',
    'remediation_action.delete': 'audit.actionDelete', 'remediation_action.batch_delete': 'audit.actionBatchDelete',
    'escalation.triggered': 'audit.escalationTriggered', 'escalation.escalated': 'audit.escalationTriggered',
    'notification_channel.create': 'audit.channelCreate', 'notification_channel.update': 'audit.channelUpdate', 'notification_channel.delete': 'audit.channelDelete',
  };

  const actionLabel = (action: string) => {
    const key = actionLabelMap[action];
    return key ? t(key) : action;
  };

  const resourceTypeIcon: Record<string, string> = {
    alert: '🔔', routing_rule: '🔀', suppression_rule: '🚫', remediation_template: '🔧',
    remediation_action: '⚡', escalation: '⬆️', notification_channel: '📡',
  };

  const resTypeLabelMap: Record<string, string> = {
    alert: 'res.alert', routing_rule: 'res.routingRule', suppression_rule: 'res.suppressionRule',
    remediation_template: 'res.remediationTemplate', remediation_action: 'res.remediationAction',
    escalation: 'res.escalation', notification_channel: 'res.notificationChannel',
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
      render: (v: string) => {
        const icon = resourceTypeIcon[v] || '📄';
        const label = resTypeLabelMap[v] ? t(resTypeLabelMap[v]) : v;
        return <Tag color="processing">{icon} {label}</Tag>;
      },
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
        <Popconfirm title={t('confirmDeleteLog')} onConfirm={() => handleDelete(r.id)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const actionTypes = [
    { label: t('audit.acknowledge'), value: 'alert.acknowledge' },
    { label: t('audit.silence'), value: 'alert.silence' },
    { label: t('audit.suppressed'), value: 'alert.suppressed' },
    { label: t('audit.alertDelete'), value: 'alert.delete' },
    { label: t('audit.alertBatchDelete'), value: 'alert.batch_delete' },
    { label: t('audit.routingCreate'), value: 'routing_rule.create' },
    { label: t('audit.routingUpdate'), value: 'routing_rule.update' },
    { label: t('audit.routingDelete'), value: 'routing_rule.delete' },
    { label: t('audit.suppressionCreate'), value: 'suppression_rule.create' },
    { label: t('audit.suppressionUpdate'), value: 'suppression_rule.update' },
    { label: t('audit.suppressionDelete'), value: 'suppression_rule.delete' },
    { label: t('audit.templateCreate'), value: 'template.create' },
    { label: t('audit.templateUpdate'), value: 'template.update' },
    { label: t('audit.templateDelete'), value: 'template.delete' },
    { label: t('audit.templateApply'), value: 'template.apply' },
    { label: t('audit.escalationTriggered'), value: 'escalation.triggered' },
  ];

  const resourceTypes = [
    { label: t('res.alert'), value: 'alert' },
    { label: t('res.routingRule'), value: 'routing_rule' },
    { label: t('res.suppressionRule'), value: 'suppression_rule' },
    { label: t('res.remediationTemplate'), value: 'remediation_template' },
    { label: t('res.remediationAction'), value: 'remediation_action' },
    { label: t('res.escalation'), value: 'escalation' },
    { label: t('res.notificationChannel'), value: 'notification_channel' },
  ];

  const statsByAction = allLogs.reduce((acc: any, l: any) => { acc[l.action] = (acc[l.action] || 0) + 1; return acc; }, {});
  const ackCount = Object.entries(statsByAction).filter(([k]) => k.includes('acknowledge')).reduce((a: number, [, v]: any) => a + v, 0);
  const createCount = Object.entries(statsByAction).filter(([k]) => k.includes('create')).reduce((a: number, [, v]: any) => a + v, 0);
  const deleteCount = Object.entries(statsByAction).filter(([k]) => k.includes('delete')).reduce((a: number, [, v]: any) => a + v, 0);

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title={t('totalActions')} value={allLogs.length} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title={t('acknowledgeCount')} value={ackCount} valueStyle={{ color: '#52c41a' }} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title={t('createCount')} value={createCount} valueStyle={{ color: '#1890ff' }} prefix={<PlusCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} size="small" style={{ background: 'var(--ant-color-bg-elevated)' }}>
            <Statistic title={t('deleteCount')} value={deleteCount} valueStyle={{ color: '#ff4d4f' }} prefix={<MinusCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }} align="middle">
        <Col>
          <Input prefix={<SearchOutlined />} placeholder={t('searchUserActionDetail')} allowClear style={{ width: 200 }}
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
            <Popconfirm title={`${t('confirmBatchDelete')} ${selectedRowKeys.length} ${t('records')}？`} onConfirm={handleBatchDelete}>
              <Button danger icon={<DeleteOutlined />}>{t('batchDelete')} ({selectedRowKeys.length})</Button>
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
          showTotal: (total) => `${t('total')} ${total} ${t('records')}`,
          onChange: (page, size) => setPageState({ current: page, pageSize: size }),
          onShowSizeChange: (current, size) => setPageState({ current: 1, pageSize: size }),
        }}
      />
    </div>
  );
};

export default AuditLog;
