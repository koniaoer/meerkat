import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, List, Tag, Typography } from 'antd';
import { AlertOutlined, RobotOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { getAlerts, getActiveModelConfig } from '../services/api';
import { useLanguage } from '../services/i18n';

const { Title } = Typography;

const Overview: React.FC = () => {
  const { t } = useLanguage();
  const [data, setData] = useState({
    totalAlerts: 0,
    activeAlerts: 0,
    activeModel: null as any,
    recentAlerts: [],
  });

  const fetchData = async () => {
    try {
      const [alertsRes, modelRes] = await Promise.all([
        getAlerts(),
        getActiveModelConfig().catch(() => ({ data: null })),
      ]);
      
      const alerts = alertsRes.data;
      setData({
        totalAlerts: alerts.length,
        activeAlerts: alerts.filter((a: any) => a.status === 'firing').length,
        activeModel: modelRes.data,
        recentAlerts: alerts.slice(0, 5),
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

  return (
    <div>
      <Title level={2}>{t('overview')}</Title>
      <Row gutter={16}>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title={t('totalAlerts')}
              value={data.totalAlerts}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title={t('activeAlerts')}
              value={data.activeAlerts}
              valueStyle={{ color: data.activeAlerts > 0 ? '#cf1322' : '#3fad49' }}
              prefix={<AlertOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title={t('activeModel')}
              value={data.activeModel ? data.activeModel.model_name : t('noActiveModel')}
              prefix={<RobotOutlined />}
              valueStyle={{ fontSize: '18px' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title={t('dashboard')} style={{ marginTop: '24px' }}>
        <List
          dataSource={data.recentAlerts}
          renderItem={(item: any) => (
            <List.Item>
              <List.Item.Meta
                title={item.alert_name}
                description={new Date(item.created_at).toLocaleString()}
              />
              <Tag color={item.status === 'firing' ? 'red' : 'green'}>
                {item.status.toUpperCase()}
              </Tag>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default Overview;
