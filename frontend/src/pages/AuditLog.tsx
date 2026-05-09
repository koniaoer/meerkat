import React, { useState, useEffect } from 'react';
import { Table, Select, Tag, Space, DatePicker, Input, Card, Row, Col, Statistic, Button } from 'antd';
import { useLanguage } from '../services/i18n';
import { getAuditLogs } from '../services/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const AuditLog: React.FC = () => {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [userFilter, setUserFilter] = useState<string | undefined>();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const loadLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params: any = { limit: pagination.pageSize, skip: (page - 1) * pagination.pageSize };
      if (actionFilter) params.action = actionFilter;
      if (typeFilter) params.resource_type = typeFilter;
      const res = await getAuditLogs(params);
      setLogs(res.data);
      setPagination(p => ({ ...p, current: page, total: res.data.length >= p.pageSize ? p.total : (page - 1) * p.pageSize + res.data.length }));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadLogs(1); }, [actionFilter, typeFilter]);

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
      'routing_rule.create': '➕ 路由创建', 'routing_rule.update': '✏️ 路由更新', 'routing_rule.delete': '🗑️ 路由删除',
      'suppression_rule.create': '➕ 抑制创建', 'suppression_rule.update': '✏️ 抑制更新', 'suppression_rule.delete': '🗑️ 抑制删除',
      'template.create': '➕ 模板创建', 'template.update': '✏️ 模板更新', 'template.delete': '🗑️ 模板删除', 'template.apply': '▶️ 模板应用',
      'escalation.triggered': '⬆️ 升级触发', 'escalation.escalated': '⬆️ 升级执行',
    };
    return map[action] || action;
  };

  const columns = [
    { title: t('time'), dataIndex: 'created_at', key: 'time', width: 170, render: (v: string) => <span style={{ fontSize: 12 }}>{new Date(v).toLocaleString()}</span>, sorter: (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(), defaultSortOrder: 'descend' as const },
    { title: t('operator'), dataIndex: 'username', key: 'user', width: 90, render: (v: string) => <Tag>{v || 'system'}</Tag> },
    { title: t('actionType'), dataIndex: 'action', key: 'action', width: 140, render: (v: string) => <Tag color={actionColor(v)}>{actionLabel(v)}</Tag> },
    { title: t('resourceType'), dataIndex: 'resource_type', key: 'rt', width: 130, render: (v: string) => <Tag color="processing">{v}</Tag> },
    { title: 'ID', dataIndex: 'resource_id', key: 'ri', width: 60 },
    { title: t('detail'), dataIndex: 'detail', key: 'detail', ellipsis: true, render: (v: string) => {
      if (!v) return '-';
      try {
        const obj = JSON.parse(v);
        return <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{Object.entries(obj).map(([k, val]) => `${k}=${val}`).join(', ')}</span>;
      } catch { return <span style={{ fontSize: 11 }}>{v}</span>; }
    }},
  ];

  const actionTypes = [
    { label: '✓ 确认告警', value: 'alert.acknowledge' },
    { label: '🔇 静默告警', value: 'alert.silence' },
    { label: '🚫 抑制告警', value: 'alert.suppressed' },
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
    { label: 'Alert', value: 'alert' },
    { label: 'Routing Rule', value: 'routing_rule' },
    { label: 'Suppression Rule', value: 'suppression_rule' },
    { label: 'Remediation Template', value: 'remediation_template' },
    { label: 'Escalation', value: 'escalation' },
    { label: 'Notification Channel', value: 'notification_channel' },
  ];

  // Quick stats
  const statsByAction = logs.reduce((acc: any, l: any) => { acc[l.action] = (acc[l.action] || 0) + 1; return acc; }, {});

  return (
    <div>
      {/* Quick stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col span={6}><Card bordered={false} size="small"><Statistic title={t('totalActions')} value={logs.length} /></Card></Col>
        <Col span={6}><Card bordered={false} size="small"><Statistic title={t('completed')} value={statsByAction['alert.acknowledge'] || 0} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card bordered={false} size="small"><Statistic title="Create" value={Object.entries(statsByAction).filter(([k]) => k.includes('create')).reduce((a: number, [, v]) => a + v, 0)} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card bordered={false} size="small"><Statistic title="Delete" value={Object.entries(statsByAction).filter(([k]) => k.includes('delete')).reduce((a: number, [, v]) => a + v, 0)} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>

      {/* Filters */}
      <Space style={{ marginBottom: 12 }} wrap>
        <Select allowClear placeholder={t('actionType')} style={{ width: 180 }} options={actionTypes} onChange={setActionFilter} />
        <Select allowClear placeholder={t('resourceType')} style={{ width: 170 }} options={resourceTypes} onChange={setTypeFilter} />
        <Button onClick={() => loadLogs(1)}>{t('refresh')}</Button>
      </Space>

      <Table dataSource={logs} columns={columns} rowKey="id" loading={loading} size="small"
        pagination={{ ...pagination, showSizeChanger: true, showTotal: (total) => `${total} ${t('totalAlerts')}` }}
        onChange={(p) => loadLogs(p.current || 1)} />
    </div>
  );
};

export default AuditLog;
