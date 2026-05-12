import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Row, Col, Card, Select, Button, Space, Modal, Form, Input, InputNumber, message, Popconfirm, Empty, Spin, Tag, Tooltip, Switch, Typography, Divider, Table } from 'antd';
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

// Parse time range: supports "1h", "now-15m", "15m" etc.
const parseRange = (range: string): number => {
  if (!range) return 3600;
  const map: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  // Handle "now-X" or "now-Xh" Grafana format
  const gf = range.match(/now-(\d+)([smhdw])/i);
  if (gf) return parseInt(gf[1]) * (map[gf[2]] || 60);
  // Handle "Xm", "Xh" etc.
  const m = range.match(/^(\d+)([smhdw])$/);
  return m ? parseInt(m[1]) * (map[m[2]] || 60) : 3600;
};

// Normalize time_range to simple format for our selector
const normalizeTimeRange = (range: string): string => {
  if (!range) return '1h';
  const seconds = parseRange(range);
  // Find closest match in our timeRanges
  for (const tr of timeRanges) {
    if (parseRange(tr.value) === seconds) return tr.value;
  }
  return range;
};

const formatValue = (val: number, unit?: string): string => {
  if (val === null || val === undefined || isNaN(val)) return '-';
  // Byte units
  if (unit === 'bytes' || unit === 'decbytes' || unit === 'binbytes') {
    if (Math.abs(val) >= 1099511627776) return (val / 1099511627776).toFixed(2) + ' TB';
    if (Math.abs(val) >= 1073741824) return (val / 1073741824).toFixed(2) + ' GB';
    if (Math.abs(val) >= 1048576) return (val / 1048576).toFixed(2) + ' MB';
    if (Math.abs(val) >= 1024) return (val / 1024).toFixed(2) + ' KB';
    return val.toFixed(0) + ' B';
  }
  if (unit === 'decmbytes' || unit === 'mbytes') {
    const bytes = val * 1048576;
    if (Math.abs(bytes) >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (Math.abs(bytes) >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    return val.toFixed(0) + ' MiB';
  }
  if (unit === 'kbytes') {
    const bytes = val * 1024;
    if (Math.abs(bytes) >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (Math.abs(bytes) >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    return val.toFixed(0) + ' KiB';
  }
  // Percent
  if (unit === 'percent' || unit === '%' || unit === 'packedpercent') return val.toFixed(1) + '%';
  if (unit === 'percentunit') return (val * 100).toFixed(1) + '%';
  // Time
  if (unit === 'seconds' || unit === 's') {
    if (val >= 86400) return (val / 86400).toFixed(1) + 'd';
    if (val >= 3600) return (val / 3600).toFixed(1) + 'h';
    if (val >= 60) return (val / 60).toFixed(1) + 'm';
    return val.toFixed(1) + 's';
  }
  if (unit === 'ms') { const v = val / 1000; return v < 60 ? v.toFixed(2) + 's' : (v / 60).toFixed(1) + 'm'; }
  // Temperature
  if (unit === 'celsius' || unit === '°C') return val.toFixed(1) + '°C';
  // Bit rate
  if (unit === 'bps' || unit === 'binbps') {
    if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + ' Gbps';
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(2) + ' Mbps';
    if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(2) + ' Kbps';
    return val.toFixed(0) + ' bps';
  }
  // Byte rate
  if (unit === 'Bps' || unit === 'binBps') {
    if (Math.abs(val) >= 1073741824) return (val / 1073741824).toFixed(2) + ' GB/s';
    if (Math.abs(val) >= 1048576) return (val / 1048576).toFixed(2) + ' MB/s';
    if (Math.abs(val) >= 1024) return (val / 1024).toFixed(2) + ' KB/s';
    return val.toFixed(0) + ' B/s';
  }
  // Frequency
  if (unit === 'hertz' || unit === 'Hz') {
    if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + ' GHz';
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(2) + ' MHz';
    if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(2) + ' KHz';
    return val.toFixed(0) + ' Hz';
  }
  // Power
  if (unit === 'watt' || unit === 'W') return Math.abs(val) >= 1000 ? (val / 1000).toFixed(2) + ' kW' : val.toFixed(1) + ' W';
  // Operations
  if (unit === 'reqps') return val.toFixed(1) + ' req/s';
  if (unit === 'iops' || unit === 'ops') return val.toFixed(0) + ' iops';
  // Default: smart number
  if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + 'G';
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(2) + 'K';
  return val.toFixed(2);
};

// Map Grafana unit strings to our internal unit names
const mapGrafanaUnit = (raw: string): string => {
  const m: Record<string, string> = {
    percentunit: 'percent', decbytes: 'bytes', binbytes: 'bytes',
    decmbytes: 'decmbytes', kbytes: 'kbytes', mbytes: 'mbytes',
    Bps: 'Bps', binBps: 'Bps', binbps: 'bps',
    short: '', none: '', ops: 'iops',
    packedpercent: 'percent', s: 'seconds', ms: 'ms',
    hertz: 'hertz', watt: 'watt',
  };
  return m[raw] || raw;
};

// Strip $var from panel titles
const cleanTitle = (title: string): string => {
  return title.replace(/\$\{[\w.]+\}/g, '').replace(/\$[\w.]+/g, '').replace(/【\s*】/g, '').replace(/【\s+/g, '【').replace(/\s+】/g, '】').replace(/\s+/g, ' ').trim();
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
  const gridRef = useRef<HTMLDivElement>(null);

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
  // Supports both range queries (for line charts) and instant queries (for table/stat/gauge)
  const fetchPanelData = useCallback(async (panel: any, dsId?: number) => {
    if (!panel.query) return;
    const ds = dsId || currentDash?.datasource_id;
    const useInstant = panel.queryMode === 'instant';

    // Parse multi-query format
    // Primary: ;;; separator (from import)
    // Fallback: ; separator (from manual input or old data)
    const queries: { expr: string; legend: string }[] = [];
    if (panel.query.includes(';;;')) {
      for (const part of panel.query.split(';;;')) {
        const sepIdx = part.indexOf('|||');
        const expr = sepIdx >= 0 ? part.substring(0, sepIdx) : part;
        const legend = sepIdx >= 0 ? part.substring(sepIdx + 3) : '';
        if (expr?.trim()) queries.push({ expr: expr.trim(), legend });
      }
    } else if (panel.query.includes('|||')) {
      for (const part of panel.query.split(';')) {
        const sepIdx = part.indexOf('|||');
        const expr = sepIdx >= 0 ? part.substring(0, sepIdx) : part;
        const legend = sepIdx >= 0 ? part.substring(sepIdx + 3) : '';
        if (expr?.trim()) queries.push({ expr: expr.trim(), legend });
      }
    } else {
      queries.push({ expr: panel.query, legend: panel.legend || '' });
    }

    // Fetch all queries in parallel
    const promises = queries.map(async (q) => {
      try {
        let res;
        if (useInstant) {
          // Instant query — for table/stat/gauge panels
          res = await prometheusQuery(q.expr, ds);
        } else {
          // Range query — for line chart panels
          const now = Math.floor(Date.now() / 1000);
          const seconds = parseRange(timeRange);
          const start = now - seconds;
          const step = seconds <= 300 ? '15' : seconds <= 3600 ? '60' : seconds <= 86400 ? '120' : '300';
          res = await prometheusQueryRange({
            query: q.expr, start: start.toString(), end: now.toString(), step, ds_id: ds,
          });
        }
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
    // Clamp refresh_interval to 10-300s
    const intervalSec = Math.max(10, Math.min(300, currentDash.refresh_interval || 30));
    timerRef.current = setInterval(refresh, intervalSec * 1000);
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
      if (editingDs?.id) await updateDatasource(editingDs.id, values);
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
    // 2. Remove ${var} and $var variables (but NOT ${label} in legendFormat like {{device}})
    q = q.replace(/\$\{[\w.]+\}/g, '').replace(/\$[\w.]+/g, '');
    // 3. Clean up empty label matchers (where $var was removed, leaving key=~"")
    q = q.replace(/,?\s*\w+\s*=~?\s*["'][^"']*["']/g, (m) => {
      const val = m.match(/=~?\s*["']([^"']*)["']/);
      if (val && val[1].trim()) return m;
      if (m.startsWith(',')) return '';
      return '';
    });
    // 4. Fix empty curly braces
    q = q.replace(/\{\s*,?\s*\}/g, '').replace(/\{\s+/g, '{');
    // 5. Fix empty range vector [] -> [5m]
    q = q.replace(/\[\s*\]/g, '[5m]');
    // 6. Clean up extra spaces, commas
    q = q.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').replace(/\{\s*,/g, '{').replace(/,\s*\}/g, '}');
    q = q.trim();
    // 7. Remove leading/trailing OR
    q = q.replace(/^OR\s+/i, '').replace(/\s+OR$/i, '');
    // 8. Fix Grafana typos (e.g. vorigin_prometheus -> origin_prometheus, then gets cleaned)
    q = q.replace(/vorigin_prometheus/g, 'origin_prometheus');
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
      const rowSections: { title: string; y: number }[] = [];

      // Flatten nested panels (Grafana rows contain sub-panels)
      const flatPanels: any[] = [];
      for (const p of rawPanels) {
        if (p.type === 'row') {
          rowSections.push({ title: p.title || '', y: p.gridPos?.y || 0 });
          if (p.panels?.length) {
            flatPanels.push(...p.panels);
          }
        } else {
          flatPanels.push(p);
        }
      }

      // Sort panels by grid position
      flatPanels.sort((a, b) => {
        const ay = a.gridPos?.y || 0, by = b.gridPos?.y || 0;
        if (ay !== by) return ay - by;
        return (a.gridPos?.x || 0) - (b.gridPos?.x || 0);
      });

      for (const p of flatPanels) {
        // Map Grafana panel type to our types + query mode
        let chartType = 'line';
        let queryMode = 'range';

        if (p.type === 'stat' || p.type === 'singlestat') {
          chartType = 'stat';
          queryMode = 'instant';
        } else if (p.type === 'gauge') {
          chartType = 'gauge';
          queryMode = 'instant';
        } else if (p.type === 'table') {
          chartType = 'table';
          queryMode = 'instant';
        } else if (p.type === 'bargauge') {
          chartType = 'bargauge';
          queryMode = 'instant';
        } else if (p.type === 'barchart' || p.type === 'bar') {
          chartType = 'line';
        } else if (p.type === 'graph') {
          // Old Grafana graph type — always use range for time-series
          chartType = 'line';
        }

        // Map unit
        const rawUnit = p.fieldConfig?.defaults?.unit || p.units || p.yaxes?.[0]?.format || '';
        const unit = mapGrafanaUnit(rawUnit);

        // Grid: Grafana uses 24-col grid
        const gridW = p.gridPos?.w || 12;
        const gridH = p.gridPos?.h || 8;
        const gridX = p.gridPos?.x || 0;
        const gridY = p.gridPos?.y || 0;

        // Build PromQL from targets — FILTER OUT hidden targets
        const targets = (p.targets || []).filter((t: any) => (t.expr || t.query) && t.hide !== true);
        if (!targets.length) continue;

        // Collect all cleaned queries with their legends
        const queries: { expr: string; legend: string }[] = [];
        for (const t of targets) {
          let q = cleanPromQL(t.expr || t.query || '');
          if (q) queries.push({ expr: q, legend: t.legendFormat || t.legend || '' });
        }
        if (!queries.length) continue;

        // Multi-query encoding: "query1|||legend1;;;query2|||legend2"
        const queryStr = queries.length > 1
          ? queries.map(q => `${q.expr}|||${q.legend}`).join(';;;')
          : queries[0].expr;

        // Clean title of $variables
        const panelTitle = cleanTitle(p.title || 'Panel');

        // Find if this panel belongs to a row section
        const parentRow = [...rowSections].reverse().find(r => r.y <= gridY);

        // For table panels, store per-target info for column rendering
        const targetsInfo = chartType === 'table'
          ? queries.map(q => ({ legend: q.legend, expr: q.expr.substring(0, 60) }))
          : undefined;

        meerkatPanels.push({
          id: `p${Date.now()}_${meerkatPanels.length}`,
          title: panelTitle,
          query: queryStr,
          unit,
          type: chartType,
          queryMode,
          grid: { x: gridX, y: gridY, w: Math.min(gridW, 24), h: gridH },
          legend: p.description || '',
          thresholds: (p.thresholds?.steps || p.fieldConfig?.defaults?.thresholds?.steps || []).map((s: any) => ({ value: s.value, color: s.color })),
          section: parentRow?.title || '',
          targetsInfo,
        });
      }

      if (!meerkatPanels.length) { message.error(t('noPanelsInImport')); return; }

      // Create the dashboard with normalized settings
      const gfRefresh = gf.refresh || gf.templating?.list?.[0]?.refresh || 30;
      const refreshInterval = typeof gfRefresh === 'number' ? Math.max(10, Math.min(300, gfRefresh)) : 30;
      const gfTimeRange = gf.time?.from || '1h';

      createMonitorDashboard({
        name: title,
        description: `Imported from Grafana: ${title}`,
        datasource_id: dsId,
        panels: meerkatPanels,
        refresh_interval: refreshInterval,
        time_range: normalizeTimeRange(gfTimeRange),
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
      return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 80 }}><Spin size="small" /></div>;
    }

    // Normalize: both single-query (old) and multi-query (new) format
    const multiData: { expr: string; legend: string; data: any }[] = Array.isArray(rawData) ? rawData : [{ expr: panel.query, legend: panel.legend || '', data: rawData }];

    // Check for errors
    const firstError = multiData.find(d => d.data?.status === 'error');
    if (firstError?.data?.status === 'error') {
      const isConn = firstError.data.errorType === 'connection';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 60, padding: 8 }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>{isConn ? '🔌' : '⚠️'}</div>
          <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary, #999)', textAlign: 'center' }}>
            {isConn ? t('datasourceConnError') : t('queryError')}
          </div>
          <div style={{ fontSize: 9, color: 'var(--ant-color-text-quaternary, #bbb)', textAlign: 'center', marginTop: 2, maxWidth: 250, wordBreak: 'break-all' }}>{firstError.data.error}</div>
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
      return <Empty description={t('noData')} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 12 }} />;
    }

    const grid = panel.grid || { w: 12, h: 8 };
    const isWide = grid.w >= 16;
    const isNarrow = grid.w <= 6;

    // TABLE type — render as antd Table with instance rows and query columns
    if (panel.type === 'table') {
      const legends = multiData.map(mq => mq.legend || mq.expr.substring(0, 30));
      const uniqueLegends = [...new Set(legends)];

      const columns: any[] = [
        { title: 'IP', dataIndex: '_instance', key: '_instance', width: 140, fixed: 'left' as const,
          render: (v: string) => <Text strong style={{ fontSize: 11 }}>{v?.replace(/:\d+$/, '')}</Text> },
      ];
      // Try to get nodename from first query that has it
      const hasNodename = allResults.some(r => r.metric?.nodename);
      if (hasNodename) {
        columns.push({ title: '主机名', dataIndex: '_nodename', key: '_nodename', width: 120,
          render: (v: string) => <span style={{ fontSize: 11 }}>{v || '-'}</span> });
      }
      for (const leg of uniqueLegends) {
        columns.push({
          title: leg, dataIndex: leg, key: leg, width: 90,
          render: (v: string) => <span style={{ fontSize: 11 }}>{v || '-'}</span>,
        });
      }

      // Build rows grouped by instance
      const rowsMap: Record<string, any> = {};
      for (const mq of multiData) {
        const legend = mq.legend || mq.expr.substring(0, 30);
        for (const r of (mq.data?.result || [])) {
          const inst = r.metric?.instance || 'unknown';
          const key = inst.replace(/:\d+$/, '');
          if (!rowsMap[key]) rowsMap[key] = { _instance: inst, _nodename: r.metric?.nodename || '', key };
          const rawVal = r.value?.[1] ?? r.values?.[r.values.length - 1]?.[1] ?? null;
          if (rawVal !== null) {
            const numVal = parseFloat(rawVal);
            // Smart unit detection based on column name
            if (legend.includes('内存') && !legend.includes('率')) rowsMap[key][legend] = formatValue(numVal, 'bytes');
            else if (legend.includes('使用率') || (legend.includes('CPU') && !legend.includes('核') && !legend.includes('iowait')))
              rowsMap[key][legend] = formatValue(numVal, 'percent');
            else if (legend.includes('带宽') || legend.includes('下载') || legend.includes('上传')) rowsMap[key][legend] = formatValue(numVal, 'bps');
            else if (legend.includes('读取') || legend.includes('写入')) rowsMap[key][legend] = formatValue(numVal, 'Bps');
            else if (legend.includes('运行') || legend.includes('启动')) rowsMap[key][legend] = formatValue(numVal, 'seconds');
            else if (legend.includes('IOutil') || legend.includes('iowait')) rowsMap[key][legend] = formatValue(numVal, 'percent');
            else if (legend.includes('连接') || legend === 'TCP_tw') rowsMap[key][legend] = formatValue(numVal, '');
            else rowsMap[key][legend] = formatValue(numVal, panel.unit || '');
          }
        }
      }

      const dataSource = Object.values(rowsMap);
      return (
        <Table
          columns={columns}
          dataSource={dataSource}
          size="small"
          pagination={false}
          scroll={{ x: columns.length * 90, y: grid.h * 30 }}
          style={{ fontSize: 11 }}
        />
      );
    }

    // BARGAUGE type — horizontal bar gauges
    if (panel.type === 'bargauge') {
      const items = allResults.slice(0, 12).map((r: any) => {
        const latest = r.values?.[r.values.length - 1]?.[1] || r.value?.[1] || 0;
        const numVal = parseFloat(latest);
        let label = r._legend || '';
        if (!label) {
          label = Object.entries(r.metric || {})
            .filter(([k, v]) => typeof v === 'string' && v !== '' && k !== '__name__')
            .map(([, v]) => v).join(' · ');
        }
        // Apply percentunit conversion for display
        const displayVal = panel.unit === 'percentunit' ? numVal * 100 : numVal;
        const displayUnit = panel.unit === 'percentunit' ? 'percent' : panel.unit;
        return { numVal: displayVal, label, displayUnit };
      });

      const maxVal = Math.max(...items.map(i => Math.abs(i.numVal)), 1);
      const thresholds = panel.thresholds || [];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: 2, height: '100%', overflow: 'auto' }}>
          {items.map((item, i) => {
            let barColor = '#52c41a';
            for (const th of thresholds) {
              if (item.numVal >= (th.value ?? 0)) barColor = th.color;
            }
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: isNarrow ? 60 : 90, fontSize: 9, color: 'var(--ant-color-text-secondary, #666)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.label}</div>
                <div style={{ flex: 1, background: 'var(--ant-color-fill-quaternary, #f5f5f5)', borderRadius: 2, height: 14, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ width: `${(Math.abs(item.numVal) / maxVal) * 100}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
                <div style={{ width: 50, fontSize: 9, fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{formatValue(item.numVal, item.displayUnit)}</div>
              </div>
            );
          })}
        </div>
      );
    }

    // Stat type
    if (panel.type === 'stat') {
      // Group results: for multi-query, each query's results get a label
      const items = allResults.slice(0, 24).map((r: any) => {
        const latest = r.values?.[r.values.length - 1]?.[1] || r.value?.[1] || 0;
        const numVal = parseFloat(latest);
        const thresholds = panel.thresholds || [];
        let color = 'var(--ant-color-text, #333)';
        for (const th of thresholds) {
          if (numVal >= th.value) color = th.color;
        }
        // Build label from legend or metric labels
        let label = r._legend || '';
        if (!label) {
          const labels = Object.entries(r.metric || {}).filter(([k, v]) => typeof v === 'string' && v !== '' && k !== '__name__');
          label = labels.map(([, v]) => v).join(' · ');
        }
        return { numVal, color, label };
      });

      // For Grafana-style "overview table" panels with many stats, show as table rows
      if (items.length > 6) {
        const cols = isNarrow ? 2 : isWide ? 6 : 4;
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4, padding: 2, height: '100%', alignContent: 'center' }}>
            {items.map((item, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '2px 0' }}>
                <div style={{ fontSize: isNarrow ? 13 : 16, fontWeight: 700, color: item.color, lineHeight: 1.2 }}>{formatValue(item.numVal, panel.unit)}</div>
                {item.label && <div style={{ fontSize: 8, color: 'var(--ant-color-text-tertiary, #999)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{item.label}</div>}
              </div>
            ))}
          </div>
        );
      }

      if (items.length <= 2) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 60, gap: 2 }}>
            {items.map((item, i) => (
              <React.Fragment key={i}>
                <div style={{ fontSize: items.length === 1 ? 32 : 24, fontWeight: 700, color: item.color, lineHeight: 1.1 }}>{formatValue(item.numVal, panel.unit)}</div>
                {item.label && <div style={{ fontSize: 10, color: 'var(--ant-color-text-tertiary, #999)' }}>{item.label}</div>}
              </React.Fragment>
            ))}
          </div>
        );
      }

      const cols = isNarrow ? 2 : 3;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6, padding: 4, height: '100%', alignContent: 'center' }}>
          {items.map((item, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{formatValue(item.numVal, panel.unit)}</div>
              {item.label && <div style={{ fontSize: 9, color: 'var(--ant-color-text-tertiary, #999)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>}
            </div>
          ))}
        </div>
      );
    }

    // Gauge type
    if (panel.type === 'gauge') {
      const latest = parseFloat(allResults[0]?.values?.[allResults[0].values.length - 1]?.[1] || allResults[0]?.value?.[1] || 0);
      const gaugeMax = panel.unit === 'percent' ? 100 : Math.max(latest * 1.5, 10);
      const option = {
        series: [{
          type: 'gauge', startAngle: 200, endAngle: -20, min: 0, max: gaugeMax,
          progress: { show: true, width: isNarrow ? 8 : 12 },
          axisLine: { lineStyle: { width: isNarrow ? 8 : 12 } },
          axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
          pointer: { show: false },
          title: { offsetCenter: [0, '70%'], fontSize: 10, color: 'var(--ant-color-text-tertiary, #999)' },
          detail: { valueAnimation: true, fontSize: isNarrow ? 18 : 24, offsetCenter: [0, '35%'], formatter: (v: number) => formatValue(v, panel.unit) },
          data: [{ value: latest, name: panel.legend || cleanTitle(panel.title) }],
        }],
      };
      return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '100%', minHeight: 120 }} notMerge lazyUpdate />;
    }

    // Default: line chart — overlay all series
    const series: any[] = [];
    const legendNames: string[] = [];
    // Limit series count to avoid cluttered charts
    const maxSeries = isNarrow ? 4 : isWide ? 16 : 8;
    const displayResults = allResults.slice(0, maxSeries);

    for (const r of displayResults) {
      const metricLabels = Object.entries(r.metric || {})
        .filter(([k, v]) => typeof v === 'string' && v !== '' && k !== '__name__')
        .map(([, v]) => v)
        .join(' · ');
      const name = r._legend || metricLabels || cleanTitle(panel.title);
      legendNames.push(name);
      series.push({
        name, type: 'line', smooth: true, symbol: 'none',
        lineStyle: { width: 1.5 },
        areaStyle: { opacity: 0.06 },
        data: (r.values || []).map((v: any) => [v[0] * 1000, parseFloat(v[1])]),
      });
    }

    const showLegend = legendNames.length > 1 && legendNames.length <= 10;
    const option = {
      tooltip: { trigger: 'axis', textStyle: { fontSize: 10 }, confine: true, formatter: (params: any) => {
        const time = new Date(params[0].value[0]).toLocaleTimeString();
        let html = `<div style="font-size:10px;color:#999">${time}</div>`;
        for (const p of params.slice(0, 6)) {
          html += `<div>${p.marker} ${p.seriesName.substring(0, 20)}: <b>${formatValue(p.value[1], panel.unit)}</b></div>`;
        }
        if (params.length > 6) html += `<div style="color:#999">...+${params.length - 6} more</div>`;
        return html;
      }},
      legend: showLegend ? { data: legendNames, textStyle: { fontSize: 9 }, type: 'scroll', bottom: 0, icon: 'line' } : undefined,
      grid: { left: 45, right: 12, top: 6, bottom: showLegend ? 26 : 6 },
      xAxis: { type: 'time', axisLabel: { fontSize: 9, color: 'var(--ant-color-text-tertiary, #999)', formatter: '{HH}:{mm}' }, splitLine: { show: false } },
      yAxis: { type: 'value', axisLabel: { fontSize: 9, color: 'var(--ant-color-text-tertiary, #999)', formatter: (v: number) => formatValue(v, panel.unit) }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.2 } } },
      dataZoom: [{ type: 'inside' }],
      series,
    };

    return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '100%', minHeight: 100 }} notMerge lazyUpdate />;
  };

  // CSS Grid layout — preserves Grafana gridPos (24-col)
  const panelGrid = currentDash?.panels?.length ? (() => {
    // Group panels by section for row headers
    const sections: { title: string; panels: any[] }[] = [];
    const noSection: any[] = [];

    for (const panel of currentDash.panels) {
      if (panel.section) {
        let sec = sections.find(s => s.title === panel.section);
        if (!sec) { sec = { title: panel.section, panels: [] }; sections.push(sec); }
        sec.panels.push(panel);
      } else {
        noSection.push(panel);
      }
    }

    // If all panels have no section, just render flat grid
    const hasSections = sections.length > 0;

    const renderPanelCard = (panel: any) => {
      const grid = panel.grid || { x: 0, y: 0, w: 12, h: 4 };
      const wPct = (Math.min(grid.w, 24) / 24) * 100;
      const hPx = grid.h * 30 + 40;
      const title = cleanTitle(panel.title || 'Panel');
      const queryPreview = panel.query?.includes(';;;')
        ? panel.query.split(';;;').length + ' queries'
        : (panel.query || '').substring(0, 60);
      const typeIcon = panel.type === 'table' ? '📊' : panel.type === 'bargauge' ? '📏' : panel.type === 'gauge' ? '🎯' : panel.type === 'stat' ? '🔢' : '📈';

      return (
        <div key={panel.id} style={{
          width: `${wPct}%`,
          minHeight: hPx,
          padding: '0 6px 12px',
          display: 'inline-block',
          verticalAlign: 'top',
        }}>
          <Card
            size="small"
            title={<Text ellipsis style={{ maxWidth: '70%', fontSize: 12, fontWeight: 600 }}>{title}</Text>}
            extra={
              <Space size={2}>
                <Tooltip title={queryPreview}><Tag style={{ maxWidth: 80, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} color="blue">{queryPreview}</Tag></Tooltip>
                <Button size="small" type="text" icon={<EditOutlined style={{ fontSize: 11 }} />} onClick={() => { setEditingPanel(panel); panelForm.setFieldsValue(panel); setPanelModalOpen(true); }} />
                <Popconfirm title={t('deleteConfirm')} onConfirm={() => deletePanel(panel.id)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />} />
                </Popconfirm>
              </Space>
            }
            styles={{ body: { padding: '6px 8px', height: `calc(100% - 40px)`, overflow: 'hidden' } }}
            style={{ height: '100%' }}
          >
            {renderChart(panel)}
          </Card>
        </div>
      );
    };

    const renderSection = (title: string, panels: any[]) => (
      <div key={title} style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ant-color-text-secondary, #666)', padding: '8px 6px 4px', borderBottom: '1px solid var(--ant-color-border, #f0f0f0)', marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {panels.map(renderPanelCard)}
        </div>
      </div>
    );

    // Sort all panels by grid position and render
    const sortedPanels = [...currentDash.panels].sort((a, b) => {
      const ay = a.grid?.y || 0, by = b.grid?.y || 0;
      return ay !== by ? ay - by : (a.grid?.x || 0) - (b.grid?.x || 0);
    });

    if (hasSections) {
      // Render with section headers
      return (
        <div>
          {sections.map(sec => renderSection(sec.title, sec.panels))}
          {noSection.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {noSection.map(renderPanelCard)}
            </div>
          )}
        </div>
      );
    }

    // Flat layout — respect grid positions by wrapping with width percentages
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {sortedPanels.map(renderPanelCard)}
      </div>
    );
  })() : (
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
                <InputNumber min={10} max={300} style={{ width: '100%' }} />
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
                  { label: `📊 Table`, value: 'table' },
                  { label: `📏 Bar Gauge`, value: 'bargauge' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit" label={t('unit')}>
                <Select allowClear options={[
                  { label: 'none', value: '' }, { label: '%', value: 'percent' },
                  { label: '% (0-1→0-100)', value: 'percentunit' },
                  { label: 'bytes', value: 'bytes' }, { label: 'MiB', value: 'decmbytes' },
                  { label: 'seconds', value: 'seconds' }, { label: 'ms', value: 'ms' },
                  { label: 'bps', value: 'bps' }, { label: 'B/s', value: 'Bps' },
                  { label: '°C', value: 'celsius' },
                  { label: 'iops', value: 'iops' }, { label: 'req/s', value: 'reqps' },
                  { label: 'Hz', value: 'hertz' }, { label: 'W', value: 'watt' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="legend" label={t('legend')}><Input /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}><Form.Item name={['grid', 'w']} label={t('width')}><InputNumber min={4} max={24} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name={['grid', 'h']} label={t('height')}><InputNumber min={2} max={20} style={{ width: '100%' }} /></Form.Item></Col>
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
