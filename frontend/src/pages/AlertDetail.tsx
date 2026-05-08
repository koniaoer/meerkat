import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Collapse, Typography, Spin } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, BellOutlined } from '@ant-design/icons';
import { getAlertById, acknowledgeAlert, silenceAlert, getRemediationActions, approveRemediationAction, executeRemediationAction } from '../services/api';
import { useLanguage } from '../services/i18n';

const { Title, Text } = Typography;

const severityColorMap: Record<string, string> = {
  critical: 'volcano',
  high: 'red',
  warning: 'orange',
  medium: 'gold',
  low: 'blue',
  info: 'default',
};

const AlertDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [alert, setAlert] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<any[]>([]);

  const fetchAlert = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getAlertById(Number(id));
      setAlert(res.data);
    } catch (error) {
      console.error('Failed to fetch alert', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActions = async () => {
    if (!id) return;
    try {
      const res = await getRemediationActions({ alert_id: Number(id) });
      setActions(res.data);
    } catch (error) {
      console.error('Failed to fetch actions', error);
    }
  };

  useEffect(() => {
    fetchAlert();
    fetchActions();
  }, [id]);

  const handleAcknowledge = async () => {
    if (!alert) return;
    try {
      await acknowledgeAlert(alert.id);
      fetchAlert();
    } catch (error) {
      console.error('Failed to acknowledge alert', error);
    }
  };

  const handleSilence = async (durationMinutes: number) => {
    if (!alert) return;
    try {
      await silenceAlert(alert.id, durationMinutes);
      fetchAlert();
    } catch (error) {
      console.error('Failed to silence alert', error);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 50 }}><Spin size="large" /></div>;
  }

  if (!alert) {
    return <div style={{ textAlign: 'center', padding: 50 }}><Text type="secondary">{t('alertNotFound')}</Text></div>;
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/alerts')}>
          {t('back')}
        </Button>
      </Space>

      {/* Alert Info Card */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions title={alert.alert_name} bordered column={2}>
          <Descriptions.Item label={t('status')}>
            <Tag color={alert.status === 'firing' ? 'red' : 'green'}>{alert.status ? alert.status.toUpperCase() : '-'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('severity')}>
            <Tag color={severityColorMap[alert.severity] || 'default'}>{alert.severity ? alert.severity.toUpperCase() : '-'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('time')}>
            {new Date(alert.created_at).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label={t('fingerprint')}>
            <Text copyable style={{ fontSize: 12 }}>{alert.fingerprint || '-'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('acknowledged')}>
            <Tag color={alert.acknowledged ? 'green' : 'default'}>{alert.acknowledged ? t('yes') : t('no')}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('silenced')}>
            <Tag color={alert.silenced ? 'orange' : 'default'}>{alert.silenced ? t('yes') : t('no')}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* AI Analysis Card */}
      <Card title={t('aiAnalysis')} style={{ marginBottom: 16 }}>
        <Descriptions bordered column={1}>
          <Descriptions.Item label={t('summary')}>
            {alert.analysis_summary || <Text type="secondary">{t('waiting')}</Text>}
          </Descriptions.Item>
          <Descriptions.Item label={t('rootCause')}>
            {alert.root_cause || <Text type="secondary">{t('waiting')}</Text>}
          </Descriptions.Item>
          <Descriptions.Item label={t('suggestion')}>
            {alert.suggestion || <Text type="secondary">{t('waiting')}</Text>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Remediation Actions Card */}
      {actions.length > 0 && (
        <Card title={t('remediationActions')} style={{ marginBottom: 16 }}>
          {actions.map((action: any) => (
            <div key={action.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Tag color={
                  action.status === 'completed' ? 'green' :
                  action.status === 'failed' ? 'red' :
                  action.status === 'pending' ? 'orange' :
                  action.status === 'executing' ? 'cyan' :
                  'default'
                }>{action.status?.toUpperCase()}</Tag>
                <Tag color={action.risk_level === 'low' ? 'green' : action.risk_level === 'high' ? 'red' : 'orange'}>
                  {action.risk_level?.toUpperCase()}
                </Tag>
                <Text strong>{action.name}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{action.description}</Text>
              </Space>
              <Space>
                {action.status === 'pending' && (
                  <>
                    <Button size="small" type="primary" onClick={() => { approveRemediationAction(action.id, true).then(() => { fetchActions(); fetchAlert(); }); }}>
                      {t('approve')}
                    </Button>
                    <Button size="small" danger onClick={() => { approveRemediationAction(action.id, false).then(() => { fetchActions(); }); }}>
                      {t('reject')}
                    </Button>
                  </>
                )}
                {['completed', 'failed', 'timeout'].includes(action.status) && (
                  <Button size="small" onClick={() => { executeRemediationAction(action.id).then(() => { fetchActions(); }); }}>
                    {t('reExecute')}
                  </Button>
                )}
                {action.result && (
                  <details style={{ fontSize: 12 }}>
                    <summary>{t('result')}</summary>
                    <pre style={{ maxHeight: 150, overflow: 'auto', background: '#f5f5f5', padding: 8, marginTop: 4 }}>
                      {(() => { try { return JSON.stringify(JSON.parse(action.result), null, 2); } catch { return action.result; } })()}
                    </pre>
                  </details>
                )}
              </Space>
            </div>
          ))}
        </Card>
      )}

      {/* Actions Card */}
      <Card title={t('actions')} style={{ marginBottom: 16 }}>
        <Space>
          {!alert.acknowledged && (
            <Button type="primary" icon={<CheckOutlined />} onClick={handleAcknowledge}>
              {t('acknowledge')}
            </Button>
          )}
          <Button icon={<BellOutlined />} onClick={() => handleSilence(120)}>
            {t('silence2h')}
          </Button>
        </Space>
      </Card>

      {/* Raw Data */}
      <Collapse
        items={[
          {
            key: 'raw',
            label: t('rawData'),
            children: (
              <pre style={{ maxHeight: 400, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4, fontSize: 12 }}>
                {JSON.stringify(alert, null, 2)}
              </pre>
            ),
          },
        ]}
      />
    </div>
  );
};

export default AlertDetail;
