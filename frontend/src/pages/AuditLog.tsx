import React, { useState, useEffect } from 'react';
import { Table, Select, Tag, Space } from 'antd';
import { useLanguage } from '../services/i18n';
import { getAuditLogs } from '../services/api';

const AuditLog: React.FC = () => {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 200 };
      if (actionFilter) params.action = actionFilter;
      if (typeFilter) params.resource_type = typeFilter;
      const res = await getAuditLogs(params);
      setLogs(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadLogs(); }, [actionFilter, typeFilter]);

  const actionColor = (action: string) => {
    if (action.includes('delete')) return 'red';
    if (action.includes('create')) return 'green';
    if (action.includes('update')) return 'blue';
    if (action.includes('suppress')) return 'orange';
    if (action.includes('approve')) return 'cyan';
    return 'default';
  };

  const columns = [
    { title: t('time'), dataIndex: 'created_at', key: 'time', width: 180, render: (v: string) => new Date(v).toLocaleString() },
    { title: t('operator'), dataIndex: 'username', key: 'user', width: 100, render: (v: string) => v || '-' },
    { title: t('actionType'), dataIndex: 'action', key: 'action', width: 160, render: (v: string) => <Tag color={actionColor(v)}>{v}</Tag> },
    { title: t('resourceType'), dataIndex: 'resource_type', key: 'rt', width: 120, render: (v: string) => <Tag>{v}</Tag> },
    { title: t('resourceId'), dataIndex: 'resource_id', key: 'ri', width: 80 },
    { title: t('detail'), dataIndex: 'detail', key: 'detail', ellipsis: true, render: (v: string) => {
      if (!v) return '-';
      try { return <span style={{ fontSize: 12 }}>{JSON.stringify(JSON.parse(v))}</span>; } catch { return v; }
    }},
  ];

  const actionTypes = [
    { label: 'alert.acknowledge', value: 'alert.acknowledge' },
    { label: 'alert.silence', value: 'alert.silence' },
    { label: 'alert.suppressed', value: 'alert.suppressed' },
    { label: 'routing_rule.create', value: 'routing_rule.create' },
    { label: 'routing_rule.update', value: 'routing_rule.update' },
    { label: 'routing_rule.delete', value: 'routing_rule.delete' },
    { label: 'suppression_rule.create', value: 'suppression_rule.create' },
    { label: 'suppression_rule.update', value: 'suppression_rule.update' },
    { label: 'suppression_rule.delete', value: 'suppression_rule.delete' },
  ];

  const resourceTypes = [
    { label: 'alert', value: 'alert' },
    { label: 'routing_rule', value: 'routing_rule' },
    { label: 'suppression_rule', value: 'suppression_rule' },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select allowClear placeholder={t('actionType')} style={{ width: 200 }} options={actionTypes} onChange={setActionFilter} />
        <Select allowClear placeholder={t('resourceType')} style={{ width: 160 }} options={resourceTypes} onChange={setTypeFilter} />
      </Space>
      <Table dataSource={logs} columns={columns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />
    </div>
  );
};

export default AuditLog;
