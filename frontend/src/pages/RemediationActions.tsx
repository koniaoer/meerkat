import React, { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Space, Select, Typography, Modal, Descriptions, message, Popconfirm, Card, Row, Col, Statistic } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined, ThunderboltOutlined, ExclamationCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { getRemediationActions, approveRemediationAction, executeRemediationAction } from '../services/api';
import { useLanguage } from '../services/i18n';

const { Title, Text } = Typography;

const statusColorMap: Record<string, string> = {
  pending: 'orange',
  approved: 'blue',
  executing: 'cyan',
  completed: 'green',
  failed: 'red',
  rejected: 'default',
  timeout: 'volcano',
};

const riskColorMap: Record<string, string> = {
  low: 'green',
  medium: 'orange',
  high: 'red',
};

const typeIconMap: Record<string, string> = {
  shell: 'Shell',
  http: 'HTTP',
  webhook: 'Webhook',
  script: 'Script',
};

const RemediationActions: React.FC = () => {
  const { t } = useLanguage();
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{ status?: string; risk_level?: string }>({});
  const [stats, setStats] = useState({ pending: 0, completed: 0, failed: 0, total: 0 });
  const [detailModal, setDetailModal] = useState<any>(null);

  const fetchActions = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.status) params.status = filters.status;
      const res = await getRemediationActions(params);
      let filtered = res.data;
      if (filters.risk_level) {
        filtered = filtered.filter((a: any) => a.risk_level === filters.risk_level);
      }
      setActions(filtered);
      // Calc stats from all actions (unfiltered)
      const allRes = await getRemediationActions({});
      const all = allRes.data;
      setStats({
        pending: all.filter((a: any) => a.status === 'pending').length,
        completed: all.filter((a: any) => a.status === 'completed').length,
        failed: all.filter((a: any) => ['failed', 'timeout'].includes(a.status)).length,
        total: all.length,
      });
    } catch (error) {
      console.error('Failed to fetch actions', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchActions();
    const interval = setInterval(fetchActions, 15000);
    return () => clearInterval(interval);
  }, [fetchActions]);

  const handleApprove = async (id: number) => {
    try {
      await approveRemediationAction(id, true);
      message.success(t('actionApproved'));
      fetchActions();
    } catch (error) {
      message.error(t('failed'));
    }
  };

  const handleReject = async (id: number) => {
    try {
      await approveRemediationAction(id, false);
      message.success(t('actionRejected'));
      fetchActions();
    } catch (error) {
      message.error(t('failed'));
    }
  };

  const handleExecute = async (id: number) => {
    try {
      await executeRemediationAction(id);
      message.success(t('actionExecuted'));
      fetchActions();
    } catch (error) {
      message.error(t('failed'));
    }
  };

  const showDetail = (record: any) => {
    setDetailModal(record);
  };

  const columns = [
    {
      title: t('time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: t('actionName'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (text: string, record: any) => (
        <a onClick={() => showDetail(record)}>{text}</a>
      ),
    },
    {
      title: t('actionType'),
      dataIndex: 'action_type',
      key: 'action_type',
      width: 90,
      render: (type: string) => <Tag>{typeIconMap[type] || type}</Tag>,
    },
    {
      title: t('riskLevel'),
      dataIndex: 'risk_level',
      key: 'risk_level',
      width: 90,
      render: (risk: string) => (
        <Tag color={riskColorMap[risk] || 'default'}>{risk ? risk.toUpperCase() : '-'}</Tag>
      ),
    },
    {
      title: t('status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={statusColorMap[status] || 'default'}>{status ? status.toUpperCase() : '-'}</Tag>
      ),
    },
    {
      title: t('autoApproved'),
      dataIndex: 'auto_approved',
      key: 'auto_approved',
      width: 90,
      render: (auto: boolean) => (
        <Tag color={auto ? 'green' : 'default'}>{auto ? t('yes') : t('no')}</Tag>
      ),
    },
    {
      title: t('actions'),
      key: 'actions',
      width: 200,
      render: (_: any, record: any) => (
        <Space size="small">
          {record.status === 'pending' && (
            <>
              <Popconfirm title={t('confirmApproveAction')} onConfirm={() => handleApprove(record.id)}>
                <Button size="small" type="primary" icon={<CheckOutlined />}>
                  {t('approve')}
                </Button>
              </Popconfirm>
              <Popconfirm title={t('confirmRejectAction')} onConfirm={() => handleReject(record.id)}>
                <Button size="small" danger icon={<CloseOutlined />}>
                  {t('reject')}
                </Button>
              </Popconfirm>
            </>
          )}
          {['completed', 'failed', 'timeout'].includes(record.status) && (
            <Popconfirm title={t('confirmReExecute')} onConfirm={() => handleExecute(record.id)}>
              <Button size="small" icon={<ReloadOutlined />}>
                {t('reExecute')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={2}>{t('remediationActions')}</Title>

      {/* Stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('totalActions')} value={stats.total} prefix={<ExclamationCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('pendingActions')} value={stats.pending} valueStyle={{ color: stats.pending > 0 ? '#fa8c16' : '#3fad49' }} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('completedActions')} value={stats.completed} valueStyle={{ color: '#3fad49' }} prefix={<CheckOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title={t('failedActions')} value={stats.failed} valueStyle={{ color: stats.failed > 0 ? '#cf1322' : '#3fad49' }} prefix={<CloseOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            allowClear
            placeholder={t('statusFilter')}
            style={{ width: 140 }}
            onChange={(val) => setFilters({ ...filters, status: val })}
            options={[
              { value: 'pending', label: t('pending') },
              { value: 'approved', label: t('approved') },
              { value: 'executing', label: t('executing') },
              { value: 'completed', label: t('completed') },
              { value: 'failed', label: t('failed') },
              { value: 'rejected', label: t('rejected') },
              { value: 'timeout', label: t('timeout') },
            ]}
          />
        </Col>
        <Col>
          <Select
            allowClear
            placeholder={t('riskLevelFilter')}
            style={{ width: 140 }}
            onChange={(val) => setFilters({ ...filters, risk_level: val })}
            options={[
              { value: 'low', label: t('low') },
              { value: 'medium', label: t('medium') },
              { value: 'high', label: t('high') },
            ]}
          />
        </Col>
      </Row>

      {/* Table */}
      <Table
        dataSource={actions}
        columns={columns}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({
          onClick: () => showDetail(record),
          style: { cursor: 'pointer' },
        })}
      />

      {/* Detail Modal */}
      <Modal
        open={!!detailModal}
        title={detailModal?.name || t('actionDetail')}
        onCancel={() => setDetailModal(null)}
        footer={null}
        width={640}
      >
        {detailModal && (
          <div>
            <Descriptions bordered column={2}>
              <Descriptions.Item label={t('actionName')}>{detailModal.name}</Descriptions.Item>
              <Descriptions.Item label={t('actionType')}>{typeIconMap[detailModal.action_type] || detailModal.action_type}</Descriptions.Item>
              <Descriptions.Item label={t('riskLevel')}>
                <Tag color={riskColorMap[detailModal.risk_level]}>{detailModal.risk_level?.toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('status')}>
                <Tag color={statusColorMap[detailModal.status]}>{detailModal.status?.toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('description')} span={2}>{detailModal.description}</Descriptions.Item>
              <Descriptions.Item label={t('autoApproved')}>{detailModal.auto_approved ? t('yes') : t('no')}</Descriptions.Item>
              <Descriptions.Item label={t('approvedBy')}>{detailModal.approved_by || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('config')} span={2}>
                <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 12 }}>
                  {(() => {
                    try { return JSON.stringify(JSON.parse(detailModal.config), null, 2); }
                    catch { return detailModal.config; }
                  })()}
                </pre>
              </Descriptions.Item>
              {detailModal.result && (
                <Descriptions.Item label={t('result')} span={2}>
                  <pre style={{ maxHeight: 200, overflow: 'auto', background: detailModal.status === 'completed' ? '#f6ffed' : '#fff2f0', padding: 8, borderRadius: 4, fontSize: 12 }}>
                    {(() => {
                      try { return JSON.stringify(JSON.parse(detailModal.result), null, 2); }
                      catch { return detailModal.result; }
                    })()}
                  </pre>
                </Descriptions.Item>
              )}
            </Descriptions>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                {detailModal.status === 'pending' && (
                  <>
                    <Button type="primary" icon={<CheckOutlined />} onClick={() => { handleApprove(detailModal.id); setDetailModal(null); }}>
                      {t('approve')}
                    </Button>
                    <Button danger icon={<CloseOutlined />} onClick={() => { handleReject(detailModal.id); setDetailModal(null); }}>
                      {t('reject')}
                    </Button>
                  </>
                )}
                {['completed', 'failed', 'timeout'].includes(detailModal.status) && (
                  <Button icon={<ReloadOutlined />} onClick={() => { handleExecute(detailModal.id); setDetailModal(null); }}>
                    {t('reExecute')}
                  </Button>
                )}
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default RemediationActions;
