import React, { useEffect, useState, useCallback } from 'react';
import { Row, Col, Card, Statistic, Select, Table, Tag, Button, Dropdown, Space, Progress, Tooltip, Popover, message, Popconfirm } from 'antd';
import { AlertOutlined, CheckCircleOutlined, EyeOutlined, ExclamationCircleOutlined,
  BellOutlined, ToolOutlined, RiseOutlined, TeamOutlined, ClockCircleOutlined,
  RedoOutlined, WarningOutlined, DeleteOutlined } from '@ant-design/icons';
import { getAlertsWithFilters, getDashboardStats, acknowledgeAlert, silenceAlert, reanalyzeAlert, deleteAlert, batchDeleteAlerts } from '../services/api';
import { useLanguage } from '../services/i18n';
import { useNavigate } from 'react-router-dom';

const severityColorMap: Record<string, string> = {
  critical: 'volcano', high: 'red', warning: 'orange', medium: 'gold', low: 'blue', info: 'default',
};

/* ── Simple bar chart via CSS ─────────────────────────────────── */
const MiniBarChart: React.FC<{ data: { date: string; total: number; resolved: number }[] }> = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.total), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, padding: '8px 0' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: 70 }}>
            <div style={{ width: 10, background: '#ff4d4f', height: `${(d.total / maxVal) * 60}px`, borderRadius: 2, transition: 'height 0.3s' }} />
            <div style={{ width: 10, background: '#52c41a', height: `${(d.resolved / maxVal) * 60}px`, borderRadius: 2, transition: 'height 0.3s' }} />
          </div>
          <span style={{ fontSize: 10, color: '#999' }}>{d.date}</span>
        </div>
      ))}
    </div>
  );
};

/* ── Severity ring ────────────────────────────────────────────── */
const SeverityRing: React.FC<{ data: Record<string, number> }> = ({ data }) => {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  const colors: Record<string, string> = { critical: '#ff4d4f', high: '#fa541c', warning: '#faad14', medium: '#ffd666', low: '#1890ff', info: '#d9d9d9' };
  let cumulative = 0;
  const segments = Object.entries(data).map(([k, v]) => {
    const start = cumulative;
    cumulative += (v / total) * 100;
    return { key: k, value: v, color: colors[k] || '#d9d9d9', start, end: cumulative };
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width="80" height="80" viewBox="0 0 36 36">
        {segments.map(s => (
          <circle key={s.key} r="16" cx="18" cy="18" fill="transparent" stroke={s.color}
            strokeWidth="4" strokeDasharray={`${s.end - s.start} ${100 - (s.end - s.start)}`}
            strokeDashoffset={-(s.start)} transform="rotate(-90 18 18)" />
        ))}
        <text x="18" y="18" textAnchor="middle" dominantBaseline="central" fontSize="7" fontWeight="bold">{total}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
            <span>{s.key}: {s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{ status?: string; severity?: string; acknowledged?: string }>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  const fetchStats = async () => {
    try { const res = await getDashboardStats(); setStats(res.data); } catch (e) { console.error(e); }
  };

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (filters.status) params.status = filters.status;
      if (filters.severity) params.severity = filters.severity;
      if (filters.acknowledged) params.acknowledged = filters.acknowledged === 'yes';
      const res = await getAlertsWithFilters(params);
      setAlerts(res.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => {
    fetchStats(); fetchAlerts();
    const iv = setInterval(() => { fetchStats(); fetchAlerts(); }, 15000);
    return () => clearInterval(iv);
  }, [fetchAlerts]);

  const handleAcknowledge = async (id: number) => { try { await acknowledgeAlert(id); fetchStats(); fetchAlerts(); } catch {} };
  const handleSilence = async (id: number, m: number) => { try { await silenceAlert(id, m); fetchStats(); fetchAlerts(); } catch {} };
  const [reanalyzing, setReanalyzing] = useState<number|null>(null);
  const handleReanalyze = async (id: number) => {
    setReanalyzing(id);
    try {
      const res = await reanalyzeAlert(id);
      if (res.data.analysis_error) {
        message.error(`AI 分析失败: ${res.data.analysis_error}`);
      } else {
        message.success('AI 分析完成');
      }
      fetchAlerts();
    } catch (e: any) {
      const detail = e.response?.data?.detail || '重试失败';
      message.error(detail);
    } finally { setReanalyzing(null); }
  };
  const handleDeleteAlert = async (id: number) => {
    try { await deleteAlert(id); message.success('已删除'); fetchStats(); fetchAlerts(); setSelectedRowKeys(prev => prev.filter(k => k !== id)); }
    catch { message.error(t('failed')); }
  };
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      await batchDeleteAlerts(selectedRowKeys);
      message.success(`已删除 ${selectedRowKeys.length} 条告警`);
      setSelectedRowKeys([]);
      fetchStats(); fetchAlerts();
    } catch { message.error(t('failed')); }
  };
  const silenceItems = (id: number) => [
    { key: '30', label: '30 min', onClick: () => handleSilence(id, 30) },
    { key: '60', label: '1 h', onClick: () => handleSilence(id, 60) },
    { key: '120', label: '2 h', onClick: () => handleSilence(id, 120) },
  ];

  const as = stats?.alert_stats || {};
  const rs = stats?.remediation_stats || {};
  const trend = stats?.alert_trend || [];

  const columns = [
    { title: t('time'), dataIndex: 'created_at', key: 't', width: 160, render: (v: string) => new Date(v).toLocaleString() },
    { title: t('alertName'), dataIndex: 'alert_name', key: 'n', ellipsis: true },
    { title: t('status'), dataIndex: 'status', key: 's', width: 90, render: (v: string) => <Tag color={v === 'firing' ? 'red' : 'green'}>{v?.toUpperCase()}</Tag> },
    { title: t('severity'), dataIndex: 'severity', key: 'sv', width: 90, render: (v: string) => <Tag color={severityColorMap[v]}>{v?.toUpperCase() || '-'}</Tag> },
    { title: t('analysisSummary'), dataIndex: 'analysis_summary', key: 'a', ellipsis: true, render: (v: string, r: any) => {
      const hasError = r.analysis_error;
      if (hasError) {
        return (
          <Space size={4}>
            <Tooltip title={
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>❌ 分析失败详情</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{r.analysis_error}</div>
              </div>
            }>
              <Tag color="error" style={{ cursor: 'pointer', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <WarningOutlined /> {v || 'AI 分析失败'}
              </Tag>
            </Tooltip>
            <Button size="small" type="link" icon={<RedoOutlined spin={reanalyzing === r.id} />} loading={reanalyzing === r.id} onClick={(e) => { e.stopPropagation(); handleReanalyze(r.id); }}>
              重试
            </Button>
          </Space>
        );
      }
      return <span style={{ color: v ? undefined : 'var(--ant-color-text-tertiary, #999)' }}>{v || t('waiting')}</span>;
    }},
    { title: t('actions'), key: 'ac', width: 180, render: (_: any, r: any) => <Space size="small">
      {!r.acknowledged && <Button size="small" onClick={e => { e.stopPropagation(); handleAcknowledge(r.id); }}>{t('acknowledge')}</Button>}
      <Dropdown menu={{ items: silenceItems(r.id) }}><Button size="small" onClick={e => e.stopPropagation()}>{t('silence')}</Button></Dropdown>
      <Popconfirm title="确定删除此告警？" onConfirm={(e?: any) => { e?.stopPropagation?.(); handleDeleteAlert(r.id); }}>
        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={e => e.stopPropagation()} />
      </Popconfirm>
    </Space> },
  ];

  return (
    <div>
      {/* ── Row 1: Core alert stats ────────────────────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col span={4}><Card bordered={false} size="small"><Statistic title={t('totalAlerts')} value={as.total || 0} prefix={<ExclamationCircleOutlined />} /></Card></Col>
        <Col span={4}><Card bordered={false} size="small"><Statistic title={t('firingAlerts')} value={as.firing || 0} valueStyle={{ color: (as.firing || 0) > 0 ? '#cf1322' : '#3fad49' }} prefix={<AlertOutlined />} /></Card></Col>
        <Col span={4}><Card bordered={false} size="small"><Statistic title={t('resolvedAlerts')} value={as.resolved || 0} valueStyle={{ color: '#3fad49' }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={4}><Card bordered={false} size="small"><Statistic title={t('recent24h')} value={as.recent_24h || 0} prefix={<ClockCircleOutlined />} /></Card></Col>
        <Col span={4}><Card bordered={false} size="small"><Statistic title={t('avgResolution')} value={as.avg_resolution_minutes || '-'} suffix={as.avg_resolution_minutes ? t('minutes') : ''} prefix={<ClockCircleOutlined />} /></Card></Col>
        <Col span={4}><Card bordered={false} size="small"><Statistic title={t('acknowledgedAlerts')} value={as.acknowledged || 0} prefix={<EyeOutlined />} /></Card></Col>
      </Row>

      {/* ── Row 2: Subsystem overview ──────────────────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col span={4}><Card bordered={false} size="small" hoverable onClick={() => navigate('/notification-channels')}><Statistic title={t('channelCount')} value={stats?.channel_count || 0} prefix={<BellOutlined />} /></Card></Col>
        <Col span={4}><Card bordered={false} size="small" hoverable onClick={() => navigate('/remediation-templates')}><Statistic title={t('templateCount')} value={stats?.template_count || 0} prefix={<ToolOutlined />} /></Card></Col>
        <Col span={4}><Card bordered={false} size="small" hoverable onClick={() => navigate('/escalation')}><Statistic title={t('activeEscalations')} value={stats?.active_escalations || 0} valueStyle={{ color: (stats?.active_escalations || 0) > 0 ? '#fa541c' : undefined }} prefix={<RiseOutlined />} /></Card></Col>
        <Col span={6}><Card bordered={false} size="small" hoverable onClick={() => navigate('/oncall')}>
          <Statistic title={t('currentOncall')} value={stats?.oncall_user || t('noOncall')} prefix={<TeamOutlined />} valueStyle={{ fontSize: 18, fontWeight: stats?.oncall_user ? 600 : 400 }} />
        </Card></Col>
        <Col span={6}><Card bordered={false} size="small" hoverable onClick={() => navigate('/remediation-actions')}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Statistic title={t('completed')} value={rs.completed || 0} valueStyle={{ color: '#52c41a', fontSize: 18 }} />
            <Statistic title={t('pending')} value={rs.pending || 0} valueStyle={{ color: '#faad14', fontSize: 18 }} />
            <Statistic title={t('failed')} value={rs.failed || 0} valueStyle={{ color: '#ff4d4f', fontSize: 18 }} />
          </div>
        </Card></Col>
      </Row>

      {/* ── Row 3: Trend + Severity + Top alerts ───────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col span={12}>
          <Card bordered={false} size="small" title={t('alertTrend')} extra={<Space><Tag color="red">Firing</Tag><Tag color="green">Resolved</Tag></Space>}>
            <MiniBarChart data={trend} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} size="small" title={t('severity')}>
            <SeverityRing data={as.by_severity || {}} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} size="small" title={t('topAlerts')} style={{ maxHeight: 200, overflow: 'auto' }}>
            {Object.entries(as.by_alert_name || {}).slice(0, 5).map(([name, count]: [string, any]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{name}</span>
                <Tag>{count}</Tag>
              </div>
            ))}
            {Object.keys(as.by_alert_name || {}).length === 0 && <span style={{ color: '#999' }}>-</span>}
          </Card>
        </Col>
      </Row>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col><Select allowClear placeholder={t('statusFilter')} style={{ width: 130 }} onChange={v => setFilters({ ...filters, status: v })} options={[{ value: 'firing', label: t('firing') }, { value: 'resolved', label: t('resolved') }]} /></Col>
        <Col><Select allowClear placeholder={t('severityFilter')} style={{ width: 130 }} onChange={v => setFilters({ ...filters, severity: v })} options={[{ value: 'critical', label: t('critical') }, { value: 'high', label: t('high') }, { value: 'warning', label: t('warning') }, { value: 'info', label: t('info') }]} /></Col>
        <Col><Select allowClear placeholder={t('acknowledgedFilter')} style={{ width: 130 }} onChange={v => setFilters({ ...filters, acknowledged: v })} options={[{ value: 'yes', label: t('yes') }, { value: 'no', label: t('no') }]} /></Col>
        {selectedRowKeys.length > 0 && (
          <Col>
            <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 条告警？`} onConfirm={handleBatchDelete}>
              <Button danger icon={<DeleteOutlined />}>批量删除 ({selectedRowKeys.length})</Button>
            </Popconfirm>
          </Col>
        )}
      </Row>

      {/* ── Alert table ────────────────────────────────────────────── */}
      <Table dataSource={alerts} columns={columns} rowKey="id" loading={loading} size="small"
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (page, size) => setPagination({ current: page, pageSize: size }),
          onShowSizeChange: (current, size) => setPagination({ current: 1, pageSize: size }),
        }}
        rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as number[]) }}
        onRow={r => ({ onClick: () => navigate(`/alerts/${r.id}`), style: { cursor: 'pointer' } })} />
    </div>
  );
};

export default Dashboard;
