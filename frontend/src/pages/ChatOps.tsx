import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Card, Space, Tag, Typography, Tooltip } from 'antd';
import { SendOutlined, PlusOutlined, ThunderboltOutlined, BarChartOutlined, TeamOutlined } from '@ant-design/icons';
import { useLanguage } from '../services/i18n';
import { sendChatMessage, getChatHistory } from '../services/api';

const { Text } = Typography;

const ChatOps: React.FC = () => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const newChat = () => {
    setMessages([]);
    setSessionId('');
    setInput('');
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
      if (!sessionId && data.session_id) setSessionId(data.session_id);
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
    // Simple markdown-like rendering
    return content.split('\n').map((line: string, i: number) => {
      // Bold
      line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return <div key={i} style={{ minHeight: 18 }} dangerouslySetInnerHTML={{ __html: line }} />;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Space>
          <Tag color="blue">ChatOps</Tag>
          {sessionId && <Tag>Session: {sessionId}</Tag>}
        </Space>
        <Button icon={<PlusOutlined />} onClick={newChat} size="small">{t('newChat')}</Button>
      </div>

      {/* Quick commands */}
      <Space style={{ marginBottom: 8 }} wrap>
        <Text style={{ color: '#999', fontSize: 12 }}>{t('commandHint')}:</Text>
        {quickCommands.map((qc, i) => (
          <Tooltip key={i} title={qc.cmd}>
            <Tag style={{ cursor: 'pointer' }} onClick={() => sendMessage(qc.cmd)}>{qc.icon} {qc.label}</Tag>
          </Tooltip>
        ))}
      </Space>

      {/* Messages area */}
      <Card style={{ flex: 1, overflow: 'auto', marginBottom: 12, padding: 0 }} bodyStyle={{ padding: '12px 16px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🤖</div>
            <div>Meerkat ChatOps 助手</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>
              支持: 确认告警 / 静默告警 / 查看告警 / 搜索 / 统计 / 当前值班<br/>
              也可以直接提问，AI 会根据告警上下文回答
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8,
          }}>
            <div style={{
              maxWidth: '80%', padding: '8px 12px', borderRadius: 8,
              background: msg.role === 'user' ? 'var(--ant-color-primary, #1890ff)' : 'var(--ant-color-bg-elevated, #fafafa)',
              color: msg.role === 'user' ? '#fff' : 'var(--ant-color-text, #333)',
              fontSize: 13, lineHeight: 1.6,
            }}>
              {renderContent(msg.content)}
              {msg.action_taken && <div style={{ marginTop: 4, fontSize: 11, opacity: 0.7 }}>⚡ {msg.action_taken}</div>}
            </div>
          </div>
        ))}
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
  );
};

export default ChatOps;
