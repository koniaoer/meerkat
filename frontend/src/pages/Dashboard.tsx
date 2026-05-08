import React, { useEffect, useState, useCallback } from 'react';
import { Row, Col, Card, Statistic, Select, Table, Tag, Button, Dropdown, Space, Typography } from 'antd';
import { AlertOutlined, CheckCircleOutlined, EyeOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { getAlertsWithFilters, getAlertStats, acknowledgeAlert, silenceAlert } from '../services/api';
import { useLanguage } from '../services/i18n';
import { useNavigate } from 'react-router-dom';

const { Title } = Typography;

const severityColorMap: Record<string, string> = {
  critical: 'volcano',
  high: 'red',
  warning: 'orange',
  medium: 'gold',
  low: 'blue',
  info: 'default',
};

const Dashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, firing: 0, resolved: 0, acknowledged: 0, by_severity: {} });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{ status?: string; severity?: string; acknowledged?: string }>({});

  const fetchStats = async () => {
    try {
      const res = await getAlertStats();
      setStats(res.data);
    } catch (error) {
      console.error('Failed to fetch stats', error);
    }
  };

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (filters.status) params.status = filters.status;
      if (filters.severity) params.severity = filters.severity;
      if (filters.acknowledged !== undefined && filters.acknowledged !== '') {
        params.acknowledged = filters.acknowledged === 'yes';
      }
      const res = await getAlertsWithFilters(params);
      setAlerts(res.data);
    } catch (error) {
      console.error('Failed to fetch alerts', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchStats();
    fetchAlerts();
    const interval = setInterval(() => {
      fetchStats();
      fetchAlerts();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const handleAcknowledge = async (id: number) => {
    try {
      await acknowledgeAlert(id);
      fetchStats();
      fetchAlerts();
    } catch (error) {
      console.error('Failed to acknowledge alert', error);
    }
  };

  const handleSilence = async (id: number, durationMinutes: number) => {
    try {
      await silenceAlert(id, durationMinutes);
      fetchStats();
      fetchAlerts();
    } catch (error) {
      console.error('Failed to silence alert', error);
    }
  };

  const silenceMenuItems = (id: number) => [
    { key: '30', label: '30 min', onClick: () => handleSilence(id, 30) },
    { key: '60', label: '1 h', onClick: () => handleSilence(id, 60) },
    { key: '120', label: '2 h', onClick: () => handleSilence(id, 120) },
    { key: '240', label: '4 h', onClick: () => handleSilence(id, 240) },
  ];

  const columns = [
    {
      title: t('time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: t('alertName'),
      dataIndex: 'alert_name',
      key: 'alert_name',
      ellipsis: true,
    },
    {
      title: t('status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'firing' ? 'red' : 'green'}>{status.toUpperCase()}</Tag>
      ),
    },
    {
      title: t('severity'),
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (severity: string) => (
        <Tag color={severityColorMap[severity] || 'default'}>{severity ? severity.toUpperCase() : '-'}</Tag>
      ),
    },
    {
      title: t('analysisSummary'),
      dataIndex: 'analysis_summary',
      key: 'analysis_summary',
      ellipsis: true,
      render: (text: string) => (
        <span style={{ color: text ? undefined : '#999' }}>{text || t('waiting')}</span>
      ),
    },
    {
      title: t('acknowledged'),
      dataIndex: 'acknowledged',
      key: 'acknowledged',
      width: 90,
      render: (ack: boolean) => (
        <Tag color={ack ? 'green' : 'default'}>{ack ? t('yes') : t('no')}</Tag>
      ),
    },
    {
      title: t('actions'),
      key: 'actions',
      width: 180,
      render: (_: any, record: any) => (
        <Space size="small">
          {!record.acknowledged && (
            <Button size="small" onClick={(e) => { e.stopPropagation(); handleAcknowledge(record.id); }}>
              {t('acknowledge')}
            </Button>
          )}
          <Dropdown menu={{ items: silenceMenuItems(record.id) }}>
            <Button size="small" onClick={(e) => e.stopPropagation()}>
              {t('silence')}
            </Button>
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={2}>{t('dashboard')}</Title>

      {/* Top stat cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('totalAlerts')} value={stats.total} prefix={<ExclamationCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('firingAlerts')} value={stats.firing} valueStyle={{ color: stats.firing > 0 ? '#cf1322' : '#3fad49' }} prefix={<AlertOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('resolvedAlerts')} value={stats.resolved} valueStyle={{ color: '#3fad49' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('acknowledgedAlerts')} value={stats.acknowledged} prefix={<EyeOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* Filter bar */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            allowClear
            placeholder={t('statusFilter')}
            style={{ width: 140 }}
            onChange={(val) => setFilters({ ...filters, status: val })}
            options={[
              { value: 'firing', label: t('firing') },
              { value: 'resolved', label: t('resolved') },
            ]}
          />
        </Col>
        <Col>
          <Select
            allowClear
            placeholder={t('severityFilter')}
            style={{ width: 140 }}
            onChange={(val) => setFilters({ ...filters, severity: val })}
            options={[
              { value: 'critical', label: t('critical') },
              { value: 'high', label: t('high') },
              { value: 'warning', label: t('warning') },
              { value: 'medium', label: t('medium') },
              { value: 'low', label: t('low') },
              { value: 'info', label: t('info') },
            ]}
          />
        </Col>
        <Col>
          <Select
            allowClear
            placeholder={t('acknowledgedFilter')}
            style={{ width: 140 }}
            onChange={(val) => setFilters({ ...filters, acknowledged: val })}
            options={[
              { value: 'yes', label: t('yes') },
              { value: 'no', label: t('no') },
            ]}
          />
        </Col>
      </Row>

      {/* Alert table */}
      <Table
        dataSource={alerts}
        columns={columns}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({
          onClick: () => navigate(`/alerts/${record.id}`),
          style: { cursor: 'pointer' },
        })}
      />
    </div>
  );
};

export default Dashboard;
