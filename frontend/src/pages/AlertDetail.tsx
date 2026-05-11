import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Collapse, Typography, Spin, Tooltip, message, Divider } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, BellOutlined, RedoOutlined, WarningOutlined,
  ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import { getAlertById, acknowledgeAlert, silenceAlert, reanalyzeAlert,
  getRemediationActions, approveRemediationAction, executeRemediationAction } from '../services/api';
import { useLanguage } from '../services/i18n';

const { Title, Text, Paragraph } = Typography;

const severityColorMap: Record<string, string> = {
  critical: 'volcano', high: 'red', warning: 'orange', medium: 'gold', low: 'blue', info: 'default',
};

const AlertDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [alert, setAlert] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<any[]>([]);
  const [reanalyzing, setReanalyzing] = useState(false);

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
      message.success(t('success'));
      fetchAlert();
    } catch (error) {
      message.error(t('failed'));
    }
  };

  const handleSilence = async (durationMinutes: number) => {
    if (!alert) return;
    try {
      await silenceAlert(alert.id, durationMinutes);
      message.success(t('success'));
      fetchAlert();
    } catch (error) {
      message.error(t('failed'));
    }
  };

  const handleReanalyze = async () => {
    if (!alert) return;
    setReanalyzing(true);
    try {
      const res = await reanalyzeAlert(alert.id);
      if (res.data.analysis_error) {
        message.error(`AI 分析失败: ${res.data.analysis_error}`);
      } else {
        message.success('AI 分析完成');
      }
      setAlert(res.data);
    } catch (e: any) {
      message.error(e.response?.data?.detail || '重试失败');
    } finally {
      setReanalyzing(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 50 }}><Spin size="large" /></div>;
  }

  if (!alert) {
    return <div style={{ textAlign: 'center', padding: 50 }}><Text type="secondary">{t('alertNotFound')}</Text></div>;
  }

  // Parse raw_data for labels and annotations
  let rawData: any = {};
  try { rawData = JSON.parse(alert.raw_data); } catch {}
  const labels: Record<string, string> = rawData.labels || {};
  const annotations: Record<string, string> = rawData.annotations || {};
  const isSilenced = alert.silenced_until && new Date(alert.silenced_until) > new Date();
  const hasAnalysisError = alert.analysis_error;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>{t('back')}</Button>
        <Title level={4} style={{ margin: 0 }}>
          {alert.status === 'firing' ? '🔴' : '🟢'} {alert.alert_name}
        </Title>
      </Space>

      {/* Alert Info Card */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label={t('status')}>
            <Tag color={alert.status === 'firing' ? 'red' : 'green'}>{alert.status?.toUpperCase()}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('severity')}>
            <Tag color={severityColorMap[alert.severity] || 'default'}>{alert.severity?.toUpperCase()}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('time')}>
            <ClockCircleOutlined /> {new Date(alert.created_at).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label={t('fingerprint')}>
            <Text copyable style={{ fontSize: 12, fontFamily: 'monospace' }}>{alert.fingerprint || '-'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('acknowledged')}>
            {alert.acknowledged ? (
              <Tag color="green">✅ {t('yes')} {alert.acknowledged_by && <span>by <UserOutlined /> {alert.acknowledged_by}</span>}</Tag>
            ) : (
              <Tag>⏳ {t('no')}</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t('silenced')}>
            {isSilenced ? (
              <Tag color="orange">🔇 {new Date(alert.silenced_until).toLocaleString()}</Tag>
            ) : (
              <Tag>{t('no')}</Tag>
            )}
          </Descriptions.Item>
          {alert.summary && (
            <Descriptions.Item label={t('summary')} span={2}>
              {alert.summary}
            </Descriptions.Item>
          )}
          {alert.description && (
            <Descriptions.Item label={t('description')} span={2}>
              <Paragraph style={{ margin: 0 }}>{alert.description}</Paragraph>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Labels & Annotations Card */}
      {(Object.keys(labels).length > 0 || Object.keys(annotations).length > 0) && (
        <Card title="🏷️ 标签与注解" style={{ marginBottom: 16 }} size="small">
          {Object.keys(labels).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Labels:</Text>
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(labels).map(([k, v]) => (
                  <Tag key={k} style={{ margin: 0 }}>{k}={v}</Tag>
                ))}
              </div>
            </div>
          )}
          {Object.keys(annotations).length > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Annotations:</Text>
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(annotations).map(([k, v]) => (
                  <Tag key={k} color="blue" style={{ margin: 0 }}>{k}={v}</Tag>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* AI Analysis Card */}
      <Card
        title="🤖 AI 分析"
        style={{ marginBottom: 16 }}
        extra={
          <Button
            icon={<RedoOutlined spin={reanalyzing} />}
            loading={reanalyzing}
            size="small"
            onClick={handleReanalyze}
          >
            {hasAnalysisError ? '重试分析' : '重新分析'}
          </Button>
        }
      >
        {hasAnalysisError && (
          <div style={{
            background: 'var(--ant-color-error-bg, #fff2f0)',
            border: '1px solid var(--ant-color-error-border, #ffccc7)',
            borderRadius: 6, padding: '8px 12px', marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <WarningOutlined style={{ color: '#ff4d4f' }} />
                <Text strong style={{ color: '#ff4d4f' }}>分析失败</Text>
              </Space>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--ant-color-text-secondary, #666)', marginTop: 4, wordBreak: 'break-all' }}>
              {alert.analysis_error}
            </div>
          </div>
        )}
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label={t('summary')}>
            <Text style={{ color: alert.analysis_summary ? undefined : 'var(--ant-color-text-tertiary, #999)' }}>
              {alert.analysis_summary || t('waiting')}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('rootCause')}>
            <Text style={{ color: alert.analysis_root_cause ? undefined : 'var(--ant-color-text-tertiary, #999)' }}>
              {alert.analysis_root_cause || t('waiting')}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('suggestion')}>
            <Text style={{ color: alert.analysis_suggestion ? undefined : 'var(--ant-color-text-tertiary, #999)' }}>
              {alert.analysis_suggestion || t('waiting')}
            </Text>
          </Descriptions.Item>
          {alert.analysis_severity && (
            <Descriptions.Item label={t('severity')}>
              <Tag color={severityColorMap[alert.analysis_severity] || 'default'}>{alert.analysis_severity.toUpperCase()}</Tag>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Remediation Actions Card */}
      {actions.length > 0 && (
        <Card title={`🔧 ${t('remediationActions')} (${actions.length})`} style={{ marginBottom: 16 }} size="small">
          {actions.map((action: any) => (
            <div key={action.id} style={{
              padding: '8px 0', borderBottom: '1px solid var(--ant-color-border, #f0f0f0)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Space>
                <Tag color={
                  action.status === 'completed' ? 'green' :
                  action.status === 'failed' ? 'red' :
                  action.status === 'pending' ? 'orange' :
                  action.status === 'executing' ? 'cyan' : 'default'
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
                    <pre style={{
                      maxHeight: 150, overflow: 'auto', padding: 8, marginTop: 4,
                      background: 'var(--ant-color-bg-text-active, rgba(0,0,0,0.06))',
                      border: '1px solid var(--ant-color-border, #d9d9d9)', borderRadius: 4,
                      color: 'var(--ant-color-text, #333)',
                    }}>
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
      <Card title={t('actions')} style={{ marginBottom: 16 }} size="small">
        <Space wrap>
          {!alert.acknowledged && (
            <Button type="primary" icon={<CheckOutlined />} onClick={handleAcknowledge}>
              {t('acknowledge')}
            </Button>
          )}
          {!isSilenced && (
            <>
              <Button icon={<BellOutlined />} onClick={() => handleSilence(30)}>🔇 30min</Button>
              <Button icon={<BellOutlined />} onClick={() => handleSilence(120)}>🔇 2h</Button>
            </>
          )}
        </Space>
      </Card>

      {/* Raw Data */}
      <Collapse
        items={[{
          key: 'raw',
          label: t('rawData'),
          children: (
            <pre style={{
              maxHeight: 400, overflow: 'auto', padding: 12, borderRadius: 4, fontSize: 12,
              background: 'var(--ant-color-bg-text-active, rgba(0,0,0,0.06))',
              border: '1px solid var(--ant-color-border, #d9d9d9)',
              color: 'var(--ant-color-text, #333)',
            }}>
              {JSON.stringify(alert, null, 2)}
            </pre>
          ),
        }]}
      />
    </div>
  );
};

export default AlertDetail;
