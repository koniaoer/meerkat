import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Row, Col, Card, Select, Button, Space, Modal, Form, Input, InputNumber, message, Popconfirm, Empty, Spin, Tag, Tooltip, Switch, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SettingOutlined, LineChartOutlined, DashboardOutlined, ApiOutlined, FullscreenOutlined, ImportOutlined } from '@ant-design/icons';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart as ELineChart, GaugeChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, ToolboxComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useLanguage } from '../services/i18n';
import { getMonitorDashboards, getMonitorDashboard, createMonitorDashboard, updateMonitorDashboard, deleteMonitorDashboard,
  getDatasources, createDatasource, updateDatasource, deleteDatasource, testDatasource,
  prometheusQuery, prometheusQueryRange } from '../services/api';

echarts.use([ELineChart, GaugeChart, BarChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, ToolboxComponent, CanvasRenderer]);

const { Text } = Typography;

const timeRanges = [
  { label: '5m', value: '5m' }, { label: '15m', value: '15m' }, { label: '30m', value: '30m' },
  { label: '1h', value: '1h' }, { label: '3h', value: '3h' }, { label: '6h', value: '6h' },
  { label: '12h', value: '12h' }, { label: '24h', value: '24h' }, { label: '2d', value: '2d' },
  { label: '7d', value: '7d' }, { label: '30d', value: '30d' },
];

const parseRange = (range: string): number => {
  const map: Record<string, number> = { m: 60, h: 3600, d: 86400 };
  const m = range.match(/^(\d+)([mhd])$/);
  return m ? parseInt(m[1]) * (map[m[2]] || 60) : 3600;
};

const formatValue = (val: number, unit?: string): string => {
  if (unit === 'bytes') {
    if (val >= 1073741824) return (val / 1073741824).toFixed(2) + ' GB';
    if (val >= 1048576) return (val / 1048576).toFixed(2) + ' MB';
    if (val >= 1024) return (val / 1024).toFixed(2) + ' KB';
    return val.toFixed(0) + ' B';
  }
  if (unit === 'percent' || unit === '%') return val.toFixed(1) + '%';
  if (unit === 'seconds' || unit === 's') {
    if (val >= 86400) return (val / 86400).toFixed(1) + 'd';
    if (val >= 3600) return (val / 3600).toFixed(1) + 'h';
    if (val >= 60) return (val / 60).toFixed(1) + 'm';
    return val.toFixed(1) + 's';
  }
  if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + 'G';
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(2) + 'K';
  return val.toFixed(2);
};

const MonitorDashboardPage: React.FC = () => {
  const { t } = useLanguage();
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [currentDash, setCurrentDash] = useState<any>(null);
  const [datasources, setDatasources] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState('1h');
  const [panelData, setPanelData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [dsModalOpen, setDsModalOpen] = useState(false);
  const [dashModalOpen, setDashModalOpen] = useState(false);
  const [panelModalOpen, setPanelModalOpen] = useState(false);
  const [editingDs, setEditingDs] = useState<any>(null);
  const [editingPanel, setEditingPanel] = useState<any>(null);
  const [dsForm] = Form.useForm();
  const [dashForm] = Form.useForm();
  const [panelForm] = Form.useForm();
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [dashRes, dsRes] = await Promise.all([getMonitorDashboards(), getDatasources()]);
      setDashboards(dashRes.data);
      setDatasources(dsRes.data);
      if (dashRes.data.length > 0 && !currentDash) {
        setCurrentDash(dashRes.data[0]);
      }
    } catch {}
  }, []);

  useEffect(() => { loadData(); }, []);

  // Fetch panel data — supports multi-query format "q1|||leg1;;;q2|||leg2"
  const fetchPanelData = useCallback(async (panel: any, dsId?: number) => {
    if (!panel.query) return;
    const now = Math.floor(Date.now() / 1000);
    const seconds = parseRange(timeRange);
    const start = now - seconds;
    const step = seconds <= 300 ? '15' : seconds <= 3600 ? '60' : seconds <= 86400 ? '120' : '300';

    // Parse multi-query format
    const queries: { expr: string; legend: string }[] = [];
    if (panel.query.includes(';;;')) {
      for (const part of panel.query.split(';;;')) {
        const [expr, legend] = part.split('|||');
        if (expr?.trim()) queries.push({ expr: expr.trim(), legend: legend || '' });
      }
    } else {
      queries.push({ expr: panel.query, legend: panel.legend || '' });
    }

    // Fetch all queries in parallel
    const results: { expr: string; legend: string; data: any }[] = [];
    const promises = queries.map(async (q) => {
      try {
        const res = await prometheusQueryRange({
          query: q.expr, start: start.toString(), end: now.toString(), step,
          ds_id: dsId || currentDash?.datasource_id,
        });
        if (res.data?.status === 'success') {
          return { expr: q.expr, legend: q.legend, data: res.data.data };
        }
        return { expr: q.expr, legend: q.legend, data: { status: 'error', error: res.data?.error || 'Query failed' } };
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || 'Connection failed';
        return { expr: q.expr, legend: q.legend, data: { status: 'error', errorType: 'connection', error: msg } };
      }
    });

    const allResults = await Promise.all(promises);
    setPanelData(prev => ({ ...prev, [panel.id]: allResults }));
  }, [timeRange, currentDash]);

  // Auto refresh
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!currentDash?.panels?.length) return;

    const refresh = () => {
      currentDash.panels.forEach((p: any) => fetchPanelData(p));
    };
    refresh();
    const interval = (currentDash.refresh_interval || 30) * 1000;
    timerRef.current = setInterval(refresh, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentDash, timeRange, fetchPanelData]);

  // Switch dashboard
  const switchDashboard = async (id: number) => {
    try {
      const res = await getMonitorDashboard(id);
      setCurrentDash(res.data);
      setPanelData({});
    } catch { message.error(t('failed')); }
  };

  // Datasource CRUD
  const onDsSubmit = async (values: any) => {
    try {
      if (editingDs) await updateDatasource(editingDs.id, values);
      else await createDatasource(values);
      message.success(t('success'));
      setDsModalOpen(false);
      loadData();
    } catch { message.error(t('failed')); }
  };

  const onTestDs = async (id: number) => {
    try {
      const res = await testDatasource(id);
      if (res.data.status === 'ok') message.success(t('testSuccess'));
      else message.error(`${t('testFailed')}: ${res.data.detail}`);
    } catch { message.error(t('testFailed')); }
  };

  // Dashboard CRUD
  const onDashSubmit = async (values: any) => {
    try {
      const payload = { ...values, panels: currentDash?.panels || [] };
      if (currentDash?.id) await updateMonitorDashboard(currentDash.id, payload);
      else await createMonitorDashboard(payload);
      message.success(t('success'));
      setDashModalOpen(false);
      loadData();
    } catch { message.error(t('failed')); }
  };

  // Panel CRUD
  const onPanelSubmit = async (values: any) => {
    try {
      const panels = [...(currentDash?.panels || [])];
      const grid = values.grid || { x: 0, y: panels.length * 4, w: 12, h: 4 };
      const panelObj = { ...values, id: values.id || `p${Date.now()}`, grid };

      if (editingPanel) {
        const idx = panels.findIndex((p: any) => p.id === editingPanel.id);
        if (idx >= 0) panels[idx] = panelObj;
      } else {
        panels.push(panelObj);
      }

      await updateMonitorDashboard(currentDash.id, { ...currentDash, panels });
      message.success(t('success'));
      setPanelModalOpen(false);
      switchDashboard(currentDash.id);
    } catch { message.error(t('failed')); }
  };

  const deletePanel = async (panelId: string) => {
    try {
      const panels = currentDash.panels.filter((p: any) => p.id !== panelId);
      await updateMonitorDashboard(currentDash.id, { ...currentDash, panels });
      message.success(t('deleted'));
      switchDashboard(currentDash.id);
    } catch { message.error(t('failed')); }
  };

  // Grafana Dashboard Import
  const cleanPromQL = (q: string): string => {
    // 1. Remove [[var]] variables
    q = q.replace(/\[\[[\w.]+\]\]/g, '');
    // 2. Remove ${var} and $var variables
    q = q.replace(/\$\{[\w.]+\}/g, '').replace(/\$[\w.]+/g, '');
    // 3. Clean up empty label matchers: ,origin_prometheus=~"" or {origin_prometheus=~""}
    q = q.replace(/,?\s*\w+\s*=~?\s*["'][^"']*["']/g, (m) => {
      const val = m.match(/=~?\s*["']([^"']*)["']/);
      if (val && val[1].trim()) return m;
      if (m.startsWith(',')) return '';
      return '';
    });
    // 4. Fix empty curly braces {}, {,}
    q = q.replace(/\{\s*,?\s*\}/g, '');
    q = q.replace(/\{\s+/g, '{');
    // 5. Fix empty range vector [] -> [5m] (rate/irate/increase need a range)
    q = q.replace(/\[\s*\]/g, '[5m]');
    // 6. Clean up extra spaces, commas
    q = q.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').replace(/\{\s*,/g, '{').replace(/,\s*\}/g, '}');
    q = q.trim();
    // 7. Remove leading "OR " or trailing " OR"
    q = q.replace(/^OR\s+/i, '').replace(/\s+OR$/i, '');
    return q;
  };

  const parseGrafanaDashboard = (jsonStr: string) => {
    try {
      const gf = JSON.parse(jsonStr);
      const rawPanels = gf.panels || (gf.dashboard?.panels) || [];
      if (!rawPanels.length) { message.error(t('noPanelsInImport')); return; }

      const title = gf.title || gf.dashboard?.title || t('importedDashboard');
      const dsId = datasources.length > 0 ? datasources[0].id : undefined;
      const meerkatPanels: any[] = [];

      // Flatten nested panels (Grafana rows contain sub-panels)
      const flatPanels: any[] = [];
      for (const p of rawPanels) {
        if (p.type === 'row' && p.panels?.length) {
          flatPanels.push(...p.panels);
        } else if (p.type !== 'row') {
          flatPanels.push(p);
        }
      }

      for (const p of flatPanels) {
        // Map Grafana panel type
        let chartType = 'line';
        if (p.type === 'stat' || p.type === 'singlestat') chartType = 'stat';
        else if (p.type === 'gauge') chartType = 'gauge';
        else if (p.type === 'table') chartType = 'stat';

        // Map unit
        const rawUnit = p.fieldConfig?.defaults?.unit || p.units || '';
        const unit = rawUnit.replace('percentunit', 'percent').replace('decbytes', 'bytes').replace('Bps', 'bytes').replace('short', '').replace('none', '');

        // Grid: Grafana uses 24-col grid, same as us — keep original positions
        const gridW = p.gridPos?.w || 12;
        const gridH = p.gridPos?.h || 8;
        const gridX = p.gridPos?.x || 0;
        const gridY = p.gridPos?.y || 0;

        // Build PromQL from targets — keep ALL targets in ONE panel
        // ECharts line chart naturally overlays multiple series
        const targets = (p.targets || []).filter((t: any) => t.expr || t.query);

        if (!targets.length) continue;

        // Collect all cleaned queries with their legends
        const queries: { expr: string; legend: string }[] = [];
        for (const t of targets) {
          let q = cleanPromQL(t.expr || t.query || '');
          if (q) queries.push({ expr: q, legend: t.legend || '' });
        }

        if (!queries.length) continue;

        // Single query: use as-is
        // Multiple queries: use the first as primary, store extras for multi-series rendering
        const primaryQuery = queries[0].expr;
        const extraQueries = queries.length > 1 ? queries.slice(1) : [];
        // For multi-query panels, we encode extra queries so the chart renderer can use them
        // Format: "query1|||legend1;;;query2|||legend2"
        const queryStr = extraQueries.length > 0
          ? queries.map(q => `${q.expr}|||${q.legend}`).join(';;;')
          : primaryQuery;

        meerkatPanels.push({
          id: `p${Date.now()}_${meerkatPanels.length}`,
          title: p.title || 'Panel',
          query: queryStr,
          unit,
          type: chartType,
          grid: { x: gridX, y: gridY, w: Math.min(gridW, 24), h: gridH },
          legend: p.description || '',
          thresholds: (p.thresholds?.steps || []).map((s: any) => ({ value: s.value, color: s.color })),
        });
      }

      if (!meerkatPanels.length) { message.error(t('noPanelsInImport')); return; }

      // Create the dashboard
      createMonitorDashboard({
        name: title,
        description: `Imported from Grafana: ${title}`,
        datasource_id: dsId,
        panels: meerkatPanels,
        refresh_interval: gf.refresh || gf.templating?.list?.[0]?.refresh || 30,
        time_range: gf.time?.from || '1h',
      }).then(() => {
        message.success(`${t('importSuccess')}: ${meerkatPanels.length} ${t('panels')}`);
        setImportModalOpen(false);
        setImportJson('');
        loadData();
      }).catch(() => message.error(t('failed')));
    } catch (e: any) {
      message.error(`${t('importFailed')}: ${e.message}`);
    }
  };
  const renderChart = (panel: any) => {
    const rawData = panelData[panel.id];
    if (!rawData) {
      return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 80 }}><Spin /></div>;
    }

    // Normalize: both single-query (old) and multi-query (new) format
    const multiData: { expr: string; legend: string; data: any }[] = Array.isArray(rawData) ? rawData : [{ expr: panel.query, legend: panel.legend || '', data: rawData }];

    // Check for errors
    const firstError = multiData.find(d => d.data?.status === 'error');
    if (firstError?.data?.status === 'error') {
      const isConn = firstError.data.errorType === 'connection';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 80, padding: 16 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>{isConn ? '🔌' : '⚠️'}</div>
          <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)', textAlign: 'center' }}>
            {isConn ? t('datasourceConnError') : t('queryError')}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ant-color-text-quaternary, #bbb)', textAlign: 'center', marginTop: 4, maxWidth: 300, wordBreak: 'break-all' }}>{firstError.data.error}</div>
        </div>
      );
    }

    // Collect all results across queries
    const allResults: any[] = [];
    for (const mq of multiData) {
      if (mq.data?.result) {
        for (const r of mq.data.result) {
          allResults.push({ ...r, _legend: mq.legend, _expr: mq.expr });
        }
      }
    }

    if (!allResults.length) {
      return <Empty description={t('noData')} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 20 }} />;
    }

    // Stat type: show multiple values in a row
    if (panel.type === 'stat') {
      const items = allResults.slice(0, 12).map((r: any, i: number) => {
        const latest = r.values?.[r.values.length - 1]?.[1] || r.value?.[1] || 0;
        const numVal = parseFloat(latest);
        const thresholds = panel.thresholds || [];
        let color = 'var(--ant-color-text, #333)';
        for (const th of thresholds) {
          if (numVal >= th.value) color = th.color;
        }
        const label = r._legend || Object.values(r.metric || {}).filter((v: any) => typeof v === 'string' && v !== '').join(' · ') || '';
        return { numVal, color, label };
      });

      if (items.length <= 2) {
        // 1-2 values: big display
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 80, gap: 4 }}>
            {items.map((item, i) => (
              <React.Fragment key={i}>
                <div style={{ fontSize: items.length === 1 ? 36 : 28, fontWeight: 700, color: item.color }}>{formatValue(item.numVal, panel.unit)}</div>
                {item.label && <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary, #999)' }}>{item.label}</div>}
              </React.Fragment>
            ))}
          </div>
        );
      }

      // 3+ values: grid layout
      const cols = Math.min(items.length, 4);
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, padding: 4, height: '100%', alignContent: 'center' }}>
          {items.map((item, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{formatValue(item.numVal, panel.unit)}</div>
              {item.label && <div style={{ fontSize: 9, color: 'var(--ant-color-text-tertiary, #999)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>}
            </div>
          ))}
        </div>
      );
    }

    // Gauge type: show first value
    if (panel.type === 'gauge') {
      const latest = parseFloat(allResults[0]?.values?.[allResults[0].values.length - 1]?.[1] || allResults[0]?.value?.[1] || 0);
      const option = {
        series: [{
          type: 'gauge', startAngle: 200, endAngle: -20, min: 0, max: 100,
          progress: { show: true, width: 14 },
          axisLine: { lineStyle: { width: 14 } },
          axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
          pointer: { show: false },
          title: { offsetCenter: [0, '60%'], fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)' },
          detail: { valueAnimation: true, fontSize: 28, offsetCenter: [0, '30%'], formatter: (v: number) => formatValue(v, panel.unit) },
          data: [{ value: latest, name: panel.legend || panel.title }],
        }],
      };
      return <ReactEChartsCore echarts={echarts} option={option} style={{ height: 180 }} notMerge lazyUpdate />;
    }

    // Default: line chart — overlay all series from all queries
    const series: any[] = [];
    const legendNames: string[] = [];
    for (const r of allResults) {
      const metricLabels = Object.values(r.metric || {}).filter((v: any) => typeof v === 'string' && v !== '').join(' · ');
      const name = r._legend || metricLabels || panel.title;
      legendNames.push(name);
      series.push({
        name, type: 'line', smooth: true, symbol: 'none',
        lineStyle: { width: 1.5 },
        areaStyle: { opacity: 0.08 },
        data: (r.values || []).map((v: any) => [v[0] * 1000, parseFloat(v[1])]),
      });
    }

    const option = {
      tooltip: { trigger: 'axis', textStyle: { fontSize: 11 }, formatter: (params: any) => {
        const time = new Date(params[0].value[0]).toLocaleString();
        let html = `<div style="font-size:11px;color:#999">${time}</div>`;
        for (const p of params) {
          html += `<div>${p.marker} ${p.seriesName}: <b>${formatValue(p.value[1], panel.unit)}</b></div>`;
        }
        return html;
      }},
      legend: legendNames.length > 1 ? { data: legendNames, textStyle: { fontSize: 10 }, type: 'scroll', bottom: 0 } : undefined,
      grid: { left: 50, right: 16, top: 8, bottom: legendNames.length > 1 ? 30 : 8 },
      xAxis: { type: 'time', axisLabel: { fontSize: 10, color: 'var(--ant-color-text-tertiary, #999)' }, splitLine: { show: false } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: 'var(--ant-color-text-tertiary, #999)', formatter: (v: number) => formatValue(v, panel.unit) }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } } },
      dataZoom: [{ type: 'inside' }],
      series,
    };

    return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '100%', minHeight: 150 }} notMerge lazyUpdate />;
  };

  // Panel grid layout
  const panelGrid = currentDash?.panels?.length ? (
    <Row gutter={[12, 12]}>
      {currentDash.panels.map((panel: any) => {
        const grid = panel.grid || { x: 0, y: 0, w: 12, h: 4 };
        const span = Math.min(grid.w, 24);
        return (
          <Col key={panel.id} span={span}>
            <Card
              size="small"
              title={<Text ellipsis style={{ maxWidth: '80%', fontSize: 13 }}>{panel.title}</Text>}
              extra={
                <Space size={4}>
                  <Tooltip title={panel.query}><Tag style={{ maxWidth: 120, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} color="blue">{panel.query}</Tag></Tooltip>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => { setEditingPanel(panel); panelForm.setFieldsValue(panel); setPanelModalOpen(true); }} />
                  <Popconfirm title={t('deleteConfirm')} onConfirm={() => deletePanel(panel.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              }
              style={{ minHeight: grid.h * 30 + 60 }}
              styles={{ body: { padding: '8px 12px', height: 'calc(100% - 46px)' } }}
            >
              {renderChart(panel)}
            </Card>
          </Col>
        );
      })}
    </Row>
  ) : (
    <Empty description={t('noPanels')} style={{ padding: 60 }}>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingPanel(null); panelForm.resetFields(); setPanelModalOpen(true); }}>{t('addPanel')}</Button>
    </Empty>
  );

  return (
    <div>
      {/* Toolbar */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }} align="middle">
        <Col>
          <Select style={{ width: 200 }} value={currentDash?.id} onChange={switchDashboard}
            options={dashboards.map((d: any) => ({ label: d.name, value: d.id }))}
            placeholder={t('selectDashboard')}
          />
        </Col>
        <Col>
          <Select style={{ width: 100 }} value={timeRange} onChange={setTimeRange}
            options={timeRanges.map(r => ({ label: r.label, value: r.value }))}
          />
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => { if (currentDash) currentDash.panels.forEach((p: any) => fetchPanelData(p)); }}>{t('refresh')}</Button>
        </Col>
        <Col>
          <Button icon={<PlusOutlined />} onClick={() => { setEditingPanel(null); panelForm.resetFields(); setPanelModalOpen(true); }}>{t('addPanel')}</Button>
        </Col>
        <Col>
          <Button icon={<EditOutlined />} onClick={() => { if (currentDash) { dashForm.setFieldsValue(currentDash); setDashModalOpen(true); } }}>{t('editDashboard')}</Button>
        </Col>
        <Col>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => { setCurrentDash(null); dashForm.resetFields(); setDashModalOpen(true); }}>{t('newDashboard')}</Button>
        </Col>
        <Col>
          <Button icon={<ImportOutlined />} onClick={() => { setImportModalOpen(true); setImportJson(''); }}>{t('importGrafana')}</Button>
        </Col>
        <Col flex="auto" />
        <Col>
          <Tooltip title={t('manageDatasources')}>
            <Button icon={<ApiOutlined />} onClick={() => { setDsModalOpen(true); loadData(); }} />
          </Tooltip>
        </Col>
        {currentDash?.datasource_id && (
          <Col>
            <Tag color="blue"><ApiOutlined /> {datasources.find((d: any) => d.id === currentDash.datasource_id)?.name || `DS#${currentDash.datasource_id}`}</Tag>
          </Col>
        )}
      </Row>

      {loading ? <Spin /> : panelGrid}

      {/* Datasource Modal */}
      <Modal title={t('manageDatasources')} open={dsModalOpen} onCancel={() => setDsModalOpen(false)} footer={null} width={700} destroyOnClose>
        <div style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingDs(null); dsForm.resetFields(); }}>{t('addDatasource')}</Button>
        </div>
        {datasources.map((ds: any) => (
          <Card key={ds.id} size="small" style={{ marginBottom: 8 }}>
            <Row align="middle">
              <Col span={6}><Text strong>{ds.name}</Text></Col>
              <Col span={10}><Text style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)' }}>{ds.url}</Text></Col>
              <Col span={3}>{ds.is_default && <Tag color="blue">{t('default')}</Tag>}</Col>
              <Col span={5}>
                <Space>
                  <Button size="small" onClick={() => onTestDs(ds.id)}>{t('testPush')}</Button>
                  <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingDs(ds); dsForm.setFieldsValue(ds); }} />
                  <Popconfirm title={t('deleteConfirm')} onConfirm={async () => { await deleteDatasource(ds.id); loadData(); }}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </Col>
            </Row>
            {editingDs?.id === ds.id && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--ant-color-border, #f0f0f0)', paddingTop: 12 }}>
                <Form form={dsForm} onFinish={onDsSubmit} layout="inline" style={{ gap: 8 }}>
                  <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="Name" style={{ width: 120 }} /></Form.Item>
                  <Form.Item name="url" rules={[{ required: true }]}><Input placeholder="http://prometheus:9090" style={{ width: 220 }} /></Form.Item>
                  <Form.Item name="is_default" valuePropName="checked"><Switch /></Form.Item>
                  <Form.Item name="headers"><Input placeholder='{"Authorization":"Bearer xxx"}' style={{ width: 180 }} /></Form.Item>
                  <Button type="primary" htmlType="submit">{t('save')}</Button>
                  <Button onClick={() => setEditingDs(null)}>{t('back')}</Button>
                </Form>
              </div>
            )}
          </Card>
        ))}
        {!editingDs && (
          <Card size="small" style={{ borderStyle: 'dashed', textAlign: 'center', cursor: 'pointer' }} onClick={() => { setEditingDs({}); dsForm.resetFields(); }}>
            <PlusOutlined /> {t('addDatasource')}
          </Card>
        )}
        {editingDs && !editingDs.id && (
          <Card size="small" style={{ marginTop: 8 }}>
            <Form form={dsForm} onFinish={onDsSubmit} layout="inline" style={{ gap: 8 }}>
              <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="Name" style={{ width: 120 }} /></Form.Item>
              <Form.Item name="url" rules={[{ required: true }]}><Input placeholder="http://prometheus:9090" style={{ width: 220 }} /></Form.Item>
              <Form.Item name="is_default" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name="headers"><Input placeholder='{"Authorization":"Bearer xxx"}' style={{ width: 180 }} /></Form.Item>
              <Button type="primary" htmlType="submit">{t('save')}</Button>
              <Button onClick={() => setEditingDs(null)}>{t('back')}</Button>
            </Form>
          </Card>
        )}
      </Modal>

      {/* Dashboard Settings Modal */}
      <Modal title={currentDash?.id ? t('editDashboard') : t('newDashboard')} open={dashModalOpen} onCancel={() => setDashModalOpen(false)} onOk={() => dashForm.submit()} destroyOnClose>
        <Form form={dashForm} onFinish={onDashSubmit} layout="vertical">
          <Form.Item name="name" label={t('title')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label={t('description')}><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="datasource_id" label={t('datasource')}>
                <Select allowClear options={datasources.map((d: any) => ({ label: d.name, value: d.id }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="time_range" label={t('defaultTimeRange')}>
                <Select options={timeRanges} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="refresh_interval" label={t('refreshIntervalSec')}>
                <InputNumber min={5} max={300} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Panel Edit Modal */}
      <Modal title={editingPanel ? t('editPanel') : t('addPanel')} open={panelModalOpen} onCancel={() => setPanelModalOpen(false)} onOk={() => panelForm.submit()} width={600} destroyOnClose>
        <Form form={panelForm} onFinish={onPanelSubmit} layout="vertical">
          <Form.Item name="title" label={t('panelTitle')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="query" label="PromQL" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="up{job='node'}" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="type" label={t('chartType')}>
                <Select options={[
                  { label: `📈 ${t('lineChart')}`, value: 'line' },
                  { label: `🔢 ${t('statChart')}`, value: 'stat' },
                  { label: `🎯 ${t('gaugeChart')}`, value: 'gauge' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit" label={t('unit')}>
                <Select allowClear options={[
                  { label: 'none', value: '' }, { label: '%', value: 'percent' },
                  { label: 'bytes', value: 'bytes' }, { label: 'seconds', value: 'seconds' },
                  { label: 'req/s', value: 'reqps' }, { label: '°C', value: 'celsius' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="legend" label={t('legend')}><Input /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}><Form.Item name={['grid', 'w']} label={t('width')}><InputNumber min={4} max={24} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name={['grid', 'h']} label={t('height')}><InputNumber min={2} max={12} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name={['grid', 'x']} label="X"><InputNumber min={0} max={24} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name={['grid', 'y']} label="Y"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      {/* Import Grafana Dashboard */}
      <Modal
        title={t('importGrafana')}
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        onOk={() => parseGrafanaDashboard(importJson)}
        okText={t('import')}
        width={700}
        destroyOnClose
      >
        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)' }}>
          {t('importGrafanaHint')}
        </div>
        <Input.TextArea
          rows={16}
          value={importJson}
          onChange={e => setImportJson(e.target.value)}
          placeholder='{"dashboard":{"panels":[...],"title":"..."},"overwrite":true}'
          style={{ fontFamily: 'monospace', fontSize: 11 }}
        />
      </Modal>
    </div>
  );
};

export default MonitorDashboardPage;
