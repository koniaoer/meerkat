import React, { useEffect, useState } from 'react';
import { Table, Tag, Typography } from 'antd';
import { getAlerts } from '../services/api';
import { useLanguage } from '../services/i18n';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await getAlerts();
      setAlerts(res.data);
    } catch (error) {
      console.error('Failed to fetch alerts', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  const columns = [
    {
      title: t('time'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: t('alertName'),
      dataIndex: 'alert_name',
      key: 'alert_name',
    },
    {
      title: t('status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'firing' ? 'red' : 'green'}>{status.toUpperCase()}</Tag>
      ),
    },
    {
      title: t('severity'),
      dataIndex: 'severity',
      key: 'severity',
      render: (severity: string) => (
        <Tag color={severity === 'critical' ? 'volcano' : 'blue'}>{severity.toUpperCase()}</Tag>
      ),
    },
    {
      title: t('analysis'),
      dataIndex: 'analysis_result',
      key: 'analysis_result',
      render: (text: string) => (
        <div style={{ maxWidth: 400, whiteSpace: 'pre-wrap' }}>
          <Text type="secondary">{text || t('waiting')}</Text>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Title level={2}>{t('dashboard')}</Title>
      <Table 
        dataSource={alerts} 
        columns={columns} 
        rowKey="id" 
        loading={loading}
      />
    </div>
  );
};

export default Dashboard;
