import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, List, Tag, Typography, Progress, Space } from 'antd';
import { AlertOutlined, RobotOutlined, CheckCircleOutlined, BellOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { getAlerts, getAlertStats, getActiveModelConfig, getNotificationChannels } from '../services/api';
import { useLanguage } from '../services/i18n';

const { Title } = Typography;

const severityColorMap: Record<string, string> = {
  critical: '#cf1322',
  high: '#f5222d',
  warning: '#fa8c16',
  medium: '#faad14',
  low: '#1890ff',
  info: '#8c8c8c',
};

const Overview: React.FC = () => {
  const { t } = useLanguage();
  const [data, setData] = useState({
    totalAlerts: 0,
    activeAlerts: 0,
    resolvedAlerts: 0,
    acknowledgedAlerts: 0,
    bySeverity: {} as Record<string, number>,
    activeModel: null as any,
    recentAlerts: [] as any[],
    activeChannels: 0,
  });

  const fetchData = async () => {
    try {
      const [statsRes, alertsRes, modelRes, channelsRes] = await Promise.all([
        getAlertStats().catch(() => ({ data: { total: 0, firing: 0, resolved: 0, acknowledged: 0, by_severity: {} } })),
        getAlerts().catch(() => ({ data: [] })),
        getActiveModelConfig().catch(() => ({ data: null })),
        getNotificationChannels().catch(() => ({ data: [] })),
      ]);

      const stats = statsRes.data;
      const channels = channelsRes.data;

      setData({
        totalAlerts: stats.total,
        activeAlerts: stats.firing,
        resolvedAlerts: stats.resolved,
        acknowledgedAlerts: stats.acknowledged,
        bySeverity: stats.by_severity || {},
        activeModel: modelRes.data,
        recentAlerts: alertsRes.data.slice(0, 5),
        activeChannels: channels.filter((c: any) => c.is_active).length,
      });
    } catch (error) {
      console.error('Failed to fetch overview data', error);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const severityEntries = Object.entries(data.bySeverity);
  const maxSeverityCount = Math.max(...severityEntries.map(([, v]) => v), 1);

  return (
    <div>
      <Title level={2}>{t('overview')}</Title>
      <Row gutter={16}>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title={t('totalAlerts')}
              value={data.totalAlerts}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title={t('activeAlerts')}
              value={data.activeAlerts}
              valueStyle={{ color: data.activeAlerts > 0 ? '#cf1322' : '#3fad49' }}
              prefix={<AlertOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title={t('activeModel')}
              value={data.activeModel ? data.activeModel.model_name : t('noActiveModel')}
              prefix={<RobotOutlined />}
              valueStyle={{ fontSize: '18px' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title={t('activeChannels')}
              value={data.activeChannels}
              prefix={<BellOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Severity Breakdown */}
      {severityEntries.length > 0 && (
        <Card title={t('severityBreakdown')} style={{ marginTop: 24 }}>
          {severityEntries.map(([severity, count]) => (
            <div key={severity} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 60, textAlign: 'right', color: severityColorMap[severity] || '#333', fontWeight: 500 }}>
                {t(severity)}
              </span>
              <Progress
                percent={Math.round((count / maxSeverityCount) * 100)}
                format={() => String(count)}
                strokeColor={severityColorMap[severity] || '#1890ff'}
                style={{ flex: 1 }}
              />
            </div>
          ))}
        </Card>
      )}

      <Card title={t('dashboard')} style={{ marginTop: '24px' }}>
        <List
          dataSource={data.recentAlerts}
          renderItem={(item: any) => (
            <List.Item>
              <List.Item.Meta
                title={item.alert_name}
                description={new Date(item.created_at).toLocaleString()}
              />
              <Space>
                <Tag color={item.status === 'firing' ? 'red' : 'green'}>
                  {item.status ? item.status.toUpperCase() : '-'}
                </Tag>
                {item.severity && (
                  <Tag color={severityColorMap[item.severity] || 'default'}>
                    {item.severity.toUpperCase()}
                  </Tag>
                )}
              </Space>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default Overview;
