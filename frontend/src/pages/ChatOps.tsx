import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Card, Space, Tag, Typography, Tooltip, List, Popconfirm, Empty, Badge } from 'antd';
import { SendOutlined, PlusOutlined, ThunderboltOutlined, BarChartOutlined, TeamOutlined,
  HistoryOutlined, DeleteOutlined, MessageOutlined } from '@ant-design/icons';
import { useLanguage } from '../services/i18n';
import { sendChatMessage, getChatSessions, deleteChatSession, getChatHistory } from '../services/api';

const { Text } = Typography;

const ChatOps: React.FC = () => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await getChatSessions();
      setSessions(res.data);
    } catch {}
    setSessionsLoading(false);
  };

  useEffect(() => { loadSessions(); }, []);

  const newChat = () => {
    setMessages([]);
    setSessionId('');
    setInput('');
  };

  const switchSession = async (sid: string) => {
    try {
      const res = await getChatHistory(sid);
      setSessionId(sid);
      setMessages(res.data);
    } catch {}
  };

  const handleDeleteSession = async (sid: string) => {
    try {
      await deleteChatSession(sid);
      if (sid === sessionId) newChat();
      loadSessions();
    } catch {}
  };

  const sendMessage = async (text?: string) => {
    const msg = text || input;
    if (!msg.trim()) return;
    setSending(true);
    setInput('');
    // Add user message to UI immediately
    setMessages(prev => [...prev, { role: 'user', content: msg, created_at: new Date().toISOString() }]);
    try {
      const res = await sendChatMessage({ message: msg, session_id: sessionId || undefined });
      const data = res.data;
      if (!sessionId && data.session_id) {
        setSessionId(data.session_id);
        loadSessions();
      }
      setMessages(prev => [...prev, { role: 'assistant', content: data.content, action_taken: data.action_taken, created_at: data.created_at }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ 发送失败，请重试', created_at: new Date().toISOString() }]);
    }
    setSending(false);
  };

  const quickCommands = [
    { label: t('statsCmd'), icon: <BarChartOutlined />, cmd: t('statsCmd') },
    { label: t('oncallCmd'), icon: <TeamOutlined />, cmd: t('oncallCmd') },
    { label: '🔥 Firing', icon: <ThunderboltOutlined />, cmd: '活跃告警' },
  ];

  const renderContent = (content: string) => {
    return content.split('\n').map((line: string, i: number) => {
      line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return <div key={i} style={{ minHeight: 18 }} dangerouslySetInnerHTML={{ __html: line }} />;
    });
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 180px)', gap: 12 }}>
      {/* Left: Session list */}
      <Card
        size="small"
        style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
        bodyStyle={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        title={<span style={{ fontSize: 13 }}><HistoryOutlined /> {t('newChat')}</span>}
        extra={<Button type="text" icon={<PlusOutlined />} onClick={newChat} size="small" title={t('newChat')} />}
      >
        <div style={{ flex: 1, overflow: 'auto' }}>
          {sessions.length === 0 && !sessionsLoading && (
            <Empty description={t('noData')} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 40 }} />
          )}
          <List
            dataSource={sessions}
            loading={sessionsLoading}
            renderItem={(s: any) => (
              <List.Item
                key={s.session_id}
                onClick={() => switchSession(s.session_id)}
                style={{
                  padding: '8px 12px', cursor: 'pointer',
                  background: s.session_id === sessionId ? 'var(--ant-color-primary-bg, #e6f7ff)' : 'transparent',
                  borderLeft: s.session_id === sessionId ? '3px solid var(--ant-color-primary, #1890ff)' : '3px solid transparent',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: s.session_id === sessionId ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <MessageOutlined style={{ marginRight: 4, color: 'var(--ant-color-text-tertiary)' }} />{s.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    <span>{s.msg_count} 条消息</span>
                    <span>{formatTime(s.last_at)}</span>
                  </div>
                </div>
                <Popconfirm title={t('deleteConfirm')} onConfirm={(e?: any) => { e?.stopPropagation?.(); handleDeleteSession(s.session_id); }}>
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" onClick={(e: any) => e?.stopPropagation?.()} style={{ flexShrink: 0 }} />
                </Popconfirm>
              </List.Item>
            )}
          />
        </div>
      </Card>

      {/* Right: Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space>
            <Tag color="blue">ChatOps</Tag>
            {sessionId && <Tag style={{ fontSize: 10 }}>ID: {sessionId}</Tag>}
          </Space>
          <Button icon={<PlusOutlined />} onClick={newChat} size="small">{t('newChat')}</Button>
        </div>

        {/* Quick commands */}
        <Space style={{ marginBottom: 8 }} wrap>
          <Text style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>{t('commandHint')}:</Text>
          {quickCommands.map((qc, i) => (
            <Tooltip key={i} title={qc.cmd}>
              <Tag style={{ cursor: 'pointer' }} onClick={() => sendMessage(qc.cmd)}>{qc.icon} {qc.label}</Tag>
            </Tooltip>
          ))}
        </Space>

        {/* Messages area */}
        <Card style={{ flex: 1, overflow: 'auto', marginBottom: 8, padding: 0 }} bodyStyle={{ padding: '12px 16px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--ant-color-text-tertiary)', padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🤖</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Meerkat ChatOps</div>
              <div style={{ fontSize: 12, lineHeight: 2 }}>
                快捷命令: 确认告警 / 静默告警 / 查看告警 / 搜索 / 统计 / 当前值班<br/>
                或直接提问，AI 根据告警上下文回答
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10,
            }}>
              {msg.role === 'assistant' && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--ant-color-primary, #1890ff)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, marginRight: 8, flexShrink: 0, marginTop: 2 }}>🤖</div>
              )}
              <div>
                <div style={{
                  maxWidth: 420, padding: '8px 12px', borderRadius: 8,
                  background: msg.role === 'user' ? 'var(--ant-color-primary, #1890ff)' : 'var(--ant-color-bg-elevated, #fafafa)',
                  color: msg.role === 'user' ? '#fff' : 'var(--ant-color-text)',
                  fontSize: 13, lineHeight: 1.6,
                  ...(msg.role === 'user' ? { borderBottomRightRadius: 2 } : { borderBottomLeftRadius: 2 }),
                }}>
                  {renderContent(msg.content)}
                  {msg.action_taken && <div style={{ marginTop: 4, fontSize: 11, opacity: 0.7 }}>⚡ {msg.action_taken}</div>}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ant-color-text-quaternary)', marginTop: 2, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                  {formatTime(msg.created_at)}
                </div>
              </div>
              {msg.role === 'user' && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#52c41a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, marginLeft: 8, flexShrink: 0, marginTop: 2 }}>👤</div>
              )}
            </div>
          ))}
          {sending && (
            <div style={{ display: 'flex', marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--ant-color-primary, #1890ff)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, marginRight: 8, flexShrink: 0 }}>🤖</div>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--ant-color-bg-elevated, #fafafa)', fontSize: 13, color: 'var(--ant-color-text-tertiary)' }}>
                正在思考<span className="dotting">...</span>
              </div>
            </div>
          )}
          <div ref={messagesEnd} />
        </Card>

        {/* Input area */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onPressEnter={() => sendMessage()}
            placeholder={t('chatPlaceholder')}
            disabled={sending}
            size="large"
          />
          <Button type="primary" icon={<SendOutlined />} onClick={() => sendMessage()} loading={sending} size="large" />
        </div>
      </div>
    </div>
  );
};

export default ChatOps;
