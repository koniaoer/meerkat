import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Select, Button, Space, Modal, Form, Input, InputNumber, message, Popconfirm, Empty, Spin, Tag, Tooltip, Switch, Typography, Table, Breadcrumb } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SettingOutlined, LineChartOutlined, DashboardOutlined, ApiOutlined, FullscreenOutlined, FullscreenExitOutlined, ImportOutlined, ClockCircleOutlined, ExpandOutlined, ColumnWidthOutlined, PauseCircleOutlined, PlayCircleOutlined, EllipsisOutlined } from '@ant-design/icons';
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
  if (!range) return 3600;
  const map: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  const gf = range.match(/now-(\d+)([smhdw])/i);
  if (gf) return parseInt(gf[1]) * (map[gf[2]] || 60);
  const m = range.match(/^(\d+)([smhdw])$/);
  return m ? parseInt(m[1]) * (map[m[2]] || 60) : 3600;
};

const normalizeTimeRange = (range: string): string => {
  if (!range) return '1h';
  const seconds = parseRange(range);
  for (const tr of timeRanges) {
    if (parseRange(tr.value) === seconds) return tr.value;
  }
  return range;
};

const formatValue = (val: number, unit?: string): string => {
  if (val === null || val === undefined || isNaN(val)) return '-';
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
  if (unit === 'percent' || unit === '%' || unit === 'packedpercent') return val.toFixed(1) + '%';
  if (unit === 'percentunit') return (val * 100).toFixed(1) + '%';
  if (unit === 'seconds' || unit === 's') {
    if (val >= 86400) return (val / 86400).toFixed(1) + 'd';
    if (val >= 3600) return (val / 3600).toFixed(1) + 'h';
    if (val >= 60) return (val / 60).toFixed(1) + 'm';
    return val.toFixed(1) + 's';
  }
  if (unit === 'ms') { const v = val / 1000; return v < 60 ? v.toFixed(2) + 's' : (v / 60).toFixed(1) + 'm'; }
  if (unit === 'celsius' || unit === '°C') return val.toFixed(1) + '°C';
  if (unit === 'bps' || unit === 'binbps') {
    if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + ' Gbps';
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(2) + ' Mbps';
    if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(2) + ' Kbps';
    return val.toFixed(0) + ' bps';
  }
  if (unit === 'Bps' || unit === 'binBps') {
    if (Math.abs(val) >= 1073741824) return (val / 1073741824).toFixed(2) + ' GB/s';
    if (Math.abs(val) >= 1048576) return (val / 1048576).toFixed(2) + ' MB/s';
    if (Math.abs(val) >= 1024) return (val / 1024).toFixed(2) + ' KB/s';
    return val.toFixed(0) + ' B/s';
  }
  if (unit === 'hertz' || unit === 'Hz') {
    if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + ' GHz';
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(2) + ' MHz';
    if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(2) + ' KHz';
    return val.toFixed(0) + ' Hz';
  }
  if (unit === 'watt' || unit === 'W') return Math.abs(val) >= 1000 ? (val / 1000).toFixed(2) + ' kW' : val.toFixed(1) + ' W';
  if (unit === 'reqps') return val.toFixed(1) + ' req/s';
  if (unit === 'iops' || unit === 'ops') return val.toFixed(0) + ' iops';
  if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + 'G';
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(2) + 'K';
  return val.toFixed(2);
};

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

const cleanTitle = (title: string): string => {
  return title.replace(/\$\{[\w.]+\}/g, '').replace(/\$[\w.]+/g, '').replace(/【\s*】/g, '').replace(/【\s+/g, '【').replace(/\s+】/g, '】').replace(/\s+/g, ' ').trim();
};

// Threshold color helper — returns the matching threshold color or undefined
const getThresholdColor = (val: number, thresholds: { value?: number; color?: string }[]): string | undefined => {
  if (!thresholds?.length) return undefined;
  let matched: string | undefined;
  for (const th of thresholds) {
    if (val >= (th.value ?? -Infinity)) matched = th.color;
  }
  return matched;
};

// Gradient tint for stat cards
const statBgGradient = (color: string, alpha: number) => {
  // Convert hex to rgba
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (color.startsWith('rgb')) {
    return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
  }
  return `rgba(100,200,255,${alpha})`; // fallback brand tint
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
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

  // Fetch panel data
  const fetchPanelData = useCallback(async (panel: any, dsId?: number) => {
    if (!panel.query) return;
    const ds = dsId || currentDash?.datasource_id;
    const useInstant = panel.queryMode === 'instant';

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

    const promises = queries.map(async (q) => {
      try {
        let res;
        if (useInstant) {
          res = await prometheusQuery(q.expr, ds);
        } else {
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
    if (!currentDash?.panels?.length || isPaused) return;

    const refresh = () => {
      currentDash.panels.forEach((p: any) => fetchPanelData(p));
    };
    refresh();
    const intervalSec = Math.max(10, Math.min(300, currentDash.refresh_interval || 30));
    timerRef.current = setInterval(refresh, intervalSec * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentDash, timeRange, fetchPanelData, isPaused]);

  const switchDashboard = async (id: number) => {
    try {
      const res = await getMonitorDashboard(id);
      setCurrentDash(res.data);
      setPanelData({});
    } catch { message.error(t('failed')); }
  };

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

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      gridRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Grafana Import
  const cleanPromQL = (q: string): string => {
    q = q.replace(/\[\[[\w.]+\]\]/g, '');
    q = q.replace(/\$\{[\w.]+\}/g, '').replace(/\$[\w.]+/g, '');
    q = q.replace(/,?\s*\w+\s*=~?\s*["'][^"']*["']/g, (m) => {
      const val = m.match(/=~?\s*["']([^"']*)["']/);
      if (val && val[1].trim()) return m;
      if (m.startsWith(',')) return '';
      return '';
    });
    q = q.replace(/\{\s*,?\s*\}/g, '').replace(/\{\s+/g, '{');
    q = q.replace(/\[\s*\]/g, '[5m]');
    q = q.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').replace(/\{\s*,/g, '{').replace(/,\s*\}/g, '}');
    q = q.trim();
    q = q.replace(/^OR\s+/i, '').replace(/\s+OR$/i, '');
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

      const flatPanels: any[] = [];
      for (const p of rawPanels) {
        if (p.type === 'row') {
          rowSections.push({ title: p.title || '', y: p.gridPos?.y || 0 });
          if (p.panels?.length) flatPanels.push(...p.panels);
        } else {
          flatPanels.push(p);
        }
      }

      flatPanels.sort((a, b) => {
        const ay = a.gridPos?.y || 0, by = b.gridPos?.y || 0;
        if (ay !== by) return ay - by;
        return (a.gridPos?.x || 0) - (b.gridPos?.x || 0);
      });

      for (const p of flatPanels) {
        let chartType = 'line';
        let queryMode = 'range';

        if (p.type === 'stat' || p.type === 'singlestat') { chartType = 'stat'; queryMode = 'instant'; }
        else if (p.type === 'gauge') { chartType = 'gauge'; queryMode = 'instant'; }
        else if (p.type === 'table') { chartType = 'table'; queryMode = 'instant'; }
        else if (p.type === 'bargauge') { chartType = 'bargauge'; queryMode = 'instant'; }
        else if (p.type === 'barchart' || p.type === 'bar') { chartType = 'line'; }
        else if (p.type === 'graph') { chartType = 'line'; }

        const rawUnit = p.fieldConfig?.defaults?.unit || p.units || p.yaxes?.[0]?.format || '';
        const unit = mapGrafanaUnit(rawUnit);
        const gridW = p.gridPos?.w || 12;
        const gridH = p.gridPos?.h || 8;
        const gridX = p.gridPos?.x || 0;
        const gridY = p.gridPos?.y || 0;

        const targets = (p.targets || []).filter((t: any) => (t.expr || t.query) && t.hide !== true);
        if (!targets.length) continue;

        const queries: { expr: string; legend: string }[] = [];
        for (const t of targets) {
          let q = cleanPromQL(t.expr || t.query || '');
          if (q) queries.push({ expr: q, legend: t.legendFormat || t.legend || '' });
        }
        if (!queries.length) continue;

        const queryStr = queries.length > 1
          ? queries.map(q => `${q.expr}|||${q.legend}`).join(';;;')
          : queries[0].expr;

        const panelTitle = cleanTitle(p.title || 'Panel');
        const parentRow = [...rowSections].reverse().find(r => r.y <= gridY);
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

  // ─── Chart Renderers ──────────────────────────────────────────────
  const renderChart = (panel: any) => {
    const rawData = panelData[panel.id];
    if (!rawData) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 80 }}>
          <Spin size="small" />
        </div>
      );
    }

    const multiData: { expr: string; legend: string; data: any }[] = Array.isArray(rawData) ? rawData : [{ expr: panel.query, legend: panel.legend || '', data: rawData }];

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

    // ── TABLE ──
    if (panel.type === 'table') {
      const legends = multiData.map(mq => mq.legend || mq.expr.substring(0, 30));
      const uniqueLegends = [...new Set(legends)];

      const columns: any[] = [
        { title: 'IP', dataIndex: '_instance', key: '_instance', width: 140, fixed: 'left' as const,
          render: (v: string) => <Text strong copyable style={{ fontSize: 11 }}>{v?.replace(/:\d+$/, '')}</Text> },
      ];
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
            // Color code percentage columns by threshold
            let cellColor = '';
            if (legend.includes('使用率') || (legend.includes('CPU') && !legend.includes('核') && !legend.includes('iowait')) || legend.includes('IOutil') || legend.includes('iowait')) {
              const tc = getThresholdColor(numVal, panel.thresholds || []);
              if (tc) cellColor = tc;
              else if (numVal > 80) cellColor = '#f5222d';
              else if (numVal > 60) cellColor = '#faad14';
              else cellColor = '#52c41a';
            }
            const fmtVal = (legend.includes('内存') && !legend.includes('率')) ? formatValue(numVal, 'bytes')
              : (legend.includes('使用率') || legend.includes('IOutil') || legend.includes('iowait') || (legend.includes('CPU') && !legend.includes('核'))) ? formatValue(numVal, 'percent')
              : (legend.includes('带宽') || legend.includes('下载') || legend.includes('上传')) ? formatValue(numVal, 'bps')
              : (legend.includes('读取') || legend.includes('写入')) ? formatValue(numVal, 'Bps')
              : (legend.includes('运行') || legend.includes('启动')) ? formatValue(numVal, 'seconds')
              : formatValue(numVal, panel.unit || '');
            rowsMap[key][legend] = cellColor ? <span style={{ color: cellColor, fontWeight: 600 }}>{fmtVal}</span> : fmtVal;
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
          scroll={{ x: columns.length * 90, y: grid.h * 28 }}
          style={{ fontSize: 11 }}
        />
      );
    }

    // ── BARGAUGE ──
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
        const displayVal = panel.unit === 'percentunit' ? numVal * 100 : numVal;
        const displayUnit = panel.unit === 'percentunit' ? 'percent' : panel.unit;
        const barColor = getThresholdColor(displayVal, panel.thresholds || []) || '#66CCFF';
        return { numVal: displayVal, label, displayUnit, barColor };
      });

      const maxVal = Math.max(...items.map(i => Math.abs(i.numVal)), 1);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 4, height: '100%', overflow: 'auto' }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tooltip title={item.label}>
                <div style={{ width: isNarrow ? 60 : 90, fontSize: 9, color: 'var(--ant-color-text-secondary, #888)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.label}</div>
              </Tooltip>
              <div style={{ flex: 1, background: 'var(--ant-color-fill-quaternary, rgba(255,255,255,0.06))', borderRadius: 3, height: 16, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  width: `${(Math.abs(item.numVal) / maxVal) * 100}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${statBgGradient(item.barColor, 0.4)}, ${item.barColor})`,
                  borderRadius: 3,
                  transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: `0 0 6px ${statBgGradient(item.barColor, 0.3)}`,
                }} />
              </div>
              <div style={{ width: 50, fontSize: 9, fontWeight: 600, textAlign: 'right', flexShrink: 0, color: item.barColor }}>{formatValue(item.numVal, item.displayUnit)}</div>
            </div>
          ))}
        </div>
      );
    }

    // ── STAT ──
    if (panel.type === 'stat') {
      const items = allResults.slice(0, 24).map((r: any) => {
        const latest = r.values?.[r.values.length - 1]?.[1] || r.value?.[1] || 0;
        const numVal = parseFloat(latest);
        const color = getThresholdColor(numVal, panel.thresholds || []) || 'var(--ant-color-text, #333)';
        let label = r._legend || '';
        if (!label) {
          const labels = Object.entries(r.metric || {}).filter(([k, v]) => typeof v === 'string' && v !== '' && k !== '__name__');
          label = labels.map(([, v]) => v).join(' · ');
        }
        return { numVal, color, label };
      });

      // Many stats — compact grid
      if (items.length > 6) {
        const cols = isNarrow ? 2 : isWide ? 6 : 4;
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4, padding: 4, height: '100%', alignContent: 'start' }}>
            {items.map((item, i) => (
              <div key={i} style={{
                textAlign: 'center', padding: '4px 2px', borderRadius: 4,
                background: statBgGradient(item.color, 0.08),
                border: `1px solid ${statBgGradient(item.color, 0.12)}`,
              }}>
                <div style={{ fontSize: isNarrow ? 13 : 16, fontWeight: 700, color: item.color, lineHeight: 1.2 }}>{formatValue(item.numVal, panel.unit)}</div>
                {item.label && <div style={{ fontSize: 8, color: 'var(--ant-color-text-tertiary, #999)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{item.label}</div>}
              </div>
            ))}
          </div>
        );
      }

      // 1-2 stats — large centered
      if (items.length <= 2) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 60, gap: 2 }}>
            {items.map((item, i) => (
              <React.Fragment key={i}>
                <div style={{ fontSize: items.length === 1 ? 32 : 24, fontWeight: 700, color: item.color, lineHeight: 1.1, textShadow: `0 0 20px ${statBgGradient(item.color, 0.25)}` }}>{formatValue(item.numVal, panel.unit)}</div>
                {item.label && <div style={{ fontSize: 10, color: 'var(--ant-color-text-tertiary, #999)' }}>{item.label}</div>}
              </React.Fragment>
            ))}
          </div>
        );
      }

      // 3-6 stats — grid
      const cols = isNarrow ? 2 : 3;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6, padding: 6, height: '100%', alignContent: 'center' }}>
          {items.map((item, i) => (
            <div key={i} style={{
              textAlign: 'center', padding: '6px 2px', borderRadius: 6,
              background: statBgGradient(item.color, 0.06),
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{formatValue(item.numVal, panel.unit)}</div>
              {item.label && <div style={{ fontSize: 9, color: 'var(--ant-color-text-tertiary, #999)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>}
            </div>
          ))}
        </div>
      );
    }

    // ── GAUGE ──
    if (panel.type === 'gauge') {
      const latest = parseFloat(allResults[0]?.values?.[allResults[0].values.length - 1]?.[1] || allResults[0]?.value?.[1] || 0);
      const gaugeMax = panel.unit === 'percent' ? 100 : Math.max(latest * 1.5, 10);
      const gaugeColor = getThresholdColor(latest, panel.thresholds || []) || '#66CCFF';
      const option = {
        series: [{
          type: 'gauge', startAngle: 200, endAngle: -20, min: 0, max: gaugeMax,
          progress: { show: true, width: isNarrow ? 8 : 12, itemStyle: { color: gaugeColor } },
          axisLine: { lineStyle: { width: isNarrow ? 8 : 12, color: [[1, 'var(--ant-color-fill-quaternary, rgba(255,255,255,0.06))']] } },
          axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
          pointer: { show: false },
          title: { offsetCenter: [0, '70%'], fontSize: 10, color: 'var(--ant-color-text-tertiary, #999)' },
          detail: { valueAnimation: true, fontSize: isNarrow ? 18 : 24, offsetCenter: [0, '35%'], formatter: (v: number) => formatValue(v, panel.unit), color: gaugeColor },
          data: [{ value: latest, name: panel.legend || cleanTitle(panel.title) }],
        }],
      };
      return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '100%', minHeight: 120 }} notMerge lazyUpdate />;
    }

    // ── LINE CHART ──
    const series: any[] = [];
    const legendNames: string[] = [];
    const maxSeries = isNarrow ? 4 : isWide ? 16 : 8;
    const displayResults = allResults.slice(0, maxSeries);

    // Build color palette
    const palette = ['#66CCFF', '#4DB8E8', '#36CFC9', '#95DE64', '#FFD666', '#FF9C6E', '#B37FEB', '#FF85C0', '#69B1FF', '#5CDBD3', '#73D13D', '#FFC53D', '#FF7A45', '#9254DE', '#F759AB', '#40A9FF'];

    for (let idx = 0; idx < displayResults.length; idx++) {
      const r = displayResults[idx];
      const metricLabels = Object.entries(r.metric || {})
        .filter(([k, v]) => typeof v === 'string' && v !== '' && k !== '__name__')
        .map(([, v]) => v)
        .join(' · ');
      const name = r._legend || metricLabels || cleanTitle(panel.title);
      legendNames.push(name);
      const lineColor = palette[idx % palette.length];
      series.push({
        name, type: 'line', smooth: true, symbol: 'none',
        lineStyle: { width: 1.5, color: lineColor },
        areaStyle: { opacity: 0.05, color: lineColor },
        data: (r.values || []).map((v: any) => [v[0] * 1000, parseFloat(v[1])]),
      });
    }

    const showLegend = legendNames.length > 1 && legendNames.length <= 10;
    const option = {
      tooltip: {
        trigger: 'axis', textStyle: { fontSize: 10 }, confine: true,
        backgroundColor: 'var(--ant-color-bg-elevated, rgba(0,0,0,0.75))',
        borderColor: 'transparent',
        formatter: (params: any) => {
          const time = new Date(params[0].value[0]).toLocaleTimeString();
          let html = `<div style="font-size:10px;color:#aaa;margin-bottom:2px">${time}</div>`;
          for (const p of params.slice(0, 6)) {
            html += `<div style="display:flex;align-items:center;gap:4px">${p.marker} <span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.seriesName.substring(0, 20)}</span> <b>${formatValue(p.value[1], panel.unit)}</b></div>`;
          }
          if (params.length > 6) html += `<div style="color:#aaa">...+${params.length - 6}</div>`;
          return html;
        },
      },
      legend: showLegend ? {
        data: legendNames, textStyle: { fontSize: 9, color: 'var(--ant-color-text-tertiary, #999)' },
        type: 'scroll', bottom: 0, icon: 'line', pageIconColor: 'var(--ant-color-text-tertiary, #999)',
        pageTextStyle: { color: 'var(--ant-color-text-tertiary, #999)' },
      } : undefined,
      grid: { left: 50, right: 12, top: 8, bottom: showLegend ? 28 : 8 },
      xAxis: {
        type: 'time', axisLabel: { fontSize: 9, color: 'var(--ant-color-text-quaternary, #aaa)', formatter: '{HH}:{mm}' },
        splitLine: { show: false }, axisLine: { lineStyle: { color: 'var(--ant-color-border, rgba(255,255,255,0.08))' } },
      },
      yAxis: {
        type: 'value', axisLabel: { fontSize: 9, color: 'var(--ant-color-text-quaternary, #aaa)', formatter: (v: number) => formatValue(v, panel.unit) },
        splitLine: { lineStyle: { type: 'dashed', opacity: 0.15, color: 'var(--ant-color-border, rgba(255,255,255,0.08))' } },
      },
      dataZoom: [{ type: 'inside' }],
      series,
    };

    return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '100%', minHeight: 100 }} notMerge lazyUpdate />;
  };

  // ─── Panel Grid Layout ─────────────────────────────────────────────
  const panelGrid = currentDash?.panels?.length ? (() => {
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

    const hasSections = sections.length > 0;

    const renderPanelCard = (panel: any) => {
      const grid = panel.grid || { x: 0, y: 0, w: 12, h: 4 };
      const wPct = (Math.min(grid.w, 24) / 24) * 100;
      const hPx = grid.h * 30 + 44;
      const title = cleanTitle(panel.title || 'Panel');
      const queryPreview = panel.query?.includes(';;;')
        ? panel.query.split(';;;').length + ' queries'
        : (panel.query || '').substring(0, 60);
      const typeIcon = panel.type === 'table' ? '📊' : panel.type === 'bargauge' ? '📏' : panel.type === 'gauge' ? '🎯' : panel.type === 'stat' ? '🔢' : '📈';
      const qMode = panel.queryMode === 'instant' ? '⚡' : '📈';

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
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                <span style={{ fontSize: 13 }}>{typeIcon}</span>
                <Text ellipsis style={{ maxWidth: 'calc(100% - 80px)', fontSize: 12, fontWeight: 600 }}>{title}</Text>
              </span>
            }
            extra={
              <Space size={0}>
                <Tooltip title={`${qMode} ${queryPreview}`}>
                  <Tag style={{ maxWidth: 70, fontSize: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRadius: 4, marginRight: 2 }} color="processing">{qMode}</Tag>
                </Tooltip>
                <Button size="small" type="text" icon={<EllipsisOutlined style={{ fontSize: 12 }} />} style={{ width: 24, height: 24 }} onClick={() => { setEditingPanel(panel); panelForm.setFieldsValue(panel); setPanelModalOpen(true); }} />
              </Space>
            }
            styles={{
              body: { padding: panel.type === 'table' ? '0 4px 4px' : '4px 8px 8px', height: `calc(100% - 38px)`, overflow: 'hidden' },
              header: { minHeight: 36, padding: '0 10px', borderBottom: '1px solid var(--ant-color-border-secondary, rgba(255,255,255,0.06))' },
            }}
            style={{
              height: '100%',
              borderRadius: 8,
              border: '1px solid var(--ant-color-border-secondary, rgba(255,255,255,0.08))',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              transition: 'box-shadow 0.2s, border-color 0.2s',
              overflow: 'hidden',
            }}
            hoverable
          >
            {renderChart(panel)}
          </Card>
        </div>
      );
    };

    const renderSection = (secTitle: string, secPanels: any[]) => (
      <div key={secTitle} style={{ marginBottom: 4 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--ant-color-text, #ddd)',
          padding: '10px 8px 6px',
          margin: '0 6px 6px',
          background: 'var(--ant-color-bg-layout, rgba(255,255,255,0.03))',
          borderRadius: 6,
          borderLeft: '3px solid #66CCFF',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <DashboardOutlined style={{ color: '#66CCFF' }} />
          {secTitle}
          <Tag style={{ fontSize: 9, marginLeft: 4, borderRadius: 4 }} color="default">{secPanels.length}</Tag>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {secPanels.map(renderPanelCard)}
        </div>
      </div>
    );

    const sortedPanels = [...currentDash.panels].sort((a, b) => {
      const ay = a.grid?.y || 0, by = b.grid?.y || 0;
      return ay !== by ? ay - by : (a.grid?.x || 0) - (b.grid?.x || 0);
    });

    if (hasSections) {
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

  // ─── Refresh indicator ──
  const refreshSec = Math.max(10, Math.min(300, currentDash?.refresh_interval || 30));
  const dsName = currentDash?.datasource_id ? datasources.find((d: any) => d.id === currentDash.datasource_id)?.name : null;

  return (
    <div ref={gridRef} style={{ minHeight: '100vh', background: isFullscreen ? 'var(--ant-color-bg-layout, #0d1b2a)' : undefined }}>
      {/* ── Top Bar ── */}
      <div style={{
        background: 'var(--ant-color-bg-container, #112240)',
        borderBottom: '1px solid var(--ant-color-border, rgba(255,255,255,0.08))',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backdropFilter: 'blur(8px)',
      }}>
        {/* Dashboard selector */}
        <Select
          style={{ width: 220, fontWeight: 600 }}
          value={currentDash?.id}
          onChange={switchDashboard}
          options={dashboards.map((d: any) => ({ label: d.name, value: d.id }))}
          placeholder={t('selectDashboard')}
          suffixIcon={<DashboardOutlined />}
        />

        <div style={{ width: 1, height: 20, background: 'var(--ant-color-border, rgba(255,255,255,0.1))' }} />

        {/* Time range */}
        <ClockCircleOutlined style={{ color: 'var(--ant-color-text-tertiary, #888)', fontSize: 14 }} />
        <Select style={{ width: 80 }} value={timeRange} onChange={setTimeRange}
          options={timeRanges.map(r => ({ label: r.label, value: r.value }))}
        />

        <div style={{ width: 1, height: 20, background: 'var(--ant-color-border, rgba(255,255,255,0.1))' }} />

        {/* Action buttons */}
        <Tooltip title={isPaused ? t('resume') || 'Resume' : t('pause') || 'Pause'}>
          <Button
            type={isPaused ? 'primary' : 'text'}
            size="small"
            icon={isPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
            onClick={() => setIsPaused(!isPaused)}
            style={{ borderRadius: 6 }}
          />
        </Tooltip>

        <Tooltip title={t('refresh')}>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => { if (currentDash) currentDash.panels.forEach((p: any) => fetchPanelData(p)); }} style={{ borderRadius: 6 }} />
        </Tooltip>

        <div style={{ width: 1, height: 20, background: 'var(--ant-color-border, rgba(255,255,255,0.1))' }} />

        <Tooltip title={t('addPanel')}>
          <Button size="small" icon={<PlusOutlined />} onClick={() => { setEditingPanel(null); panelForm.resetFields(); setPanelModalOpen(true); }} style={{ borderRadius: 6 }}>{t('addPanel')}</Button>
        </Tooltip>

        <Tooltip title={t('importGrafana')}>
          <Button size="small" icon={<ImportOutlined />} onClick={() => { setImportModalOpen(true); setImportJson(''); }} style={{ borderRadius: 6 }}>{t('importGrafana')}</Button>
        </Tooltip>

        <Tooltip title={t('editDashboard')}>
          <Button size="small" icon={<SettingOutlined />} onClick={() => { if (currentDash) { dashForm.setFieldsValue(currentDash); setDashModalOpen(true); } }} style={{ borderRadius: 6 }} />
        </Tooltip>

        <div style={{ flex: 1 }} />

        {/* Right side: datasource + status */}
        {dsName && (
          <Tag style={{ borderRadius: 4, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ApiOutlined style={{ color: '#66CCFF' }} /> {dsName}
          </Tag>
        )}

        {!isPaused && currentDash?.panels?.length && (
          <Tag style={{ borderRadius: 4, fontSize: 10, color: 'var(--ant-color-text-tertiary, #888)' }}>
            <ReloadOutlined spin style={{ fontSize: 10, marginRight: 4 }} /> {refreshSec}s
          </Tag>
        )}
        {isPaused && (
          <Tag color="warning" style={{ borderRadius: 4, fontSize: 10 }}>
            <PauseCircleOutlined style={{ fontSize: 10, marginRight: 4 }} /> Paused
          </Tag>
        )}

        <Tooltip title={isFullscreen ? t('exitFullscreen') || 'Exit Fullscreen' : t('fullscreen') || 'Fullscreen'}>
          <Button size="small" type="text" icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen} style={{ borderRadius: 6 }} />
        </Tooltip>

        <Tooltip title={t('manageDatasources')}>
          <Button size="small" type="text" icon={<ApiOutlined />} onClick={() => { setDsModalOpen(true); loadData(); }} style={{ borderRadius: 6 }} />
        </Tooltip>
      </div>

      {/* ── Panel Grid ── */}
      <div style={{ padding: '8px 12px' }}>
        {loading ? <Spin /> : panelGrid}
      </div>

      {/* ── Datasource Modal ── */}
      <Modal title={t('manageDatasources')} open={dsModalOpen} onCancel={() => setDsModalOpen(false)} footer={null} width={700} destroyOnClose>
        <div style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingDs(null); dsForm.resetFields(); }}>{t('addDatasource')}</Button>
        </div>
        {datasources.map((ds: any) => (
          <Card key={ds.id} size="small" style={{ marginBottom: 8, borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Text strong>{ds.name}</Text>
                <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary, #999)' }}>{ds.url}</div>
              </div>
              {ds.is_default && <Tag color="blue">{t('default')}</Tag>}
              <Space>
                <Button size="small" onClick={() => onTestDs(ds.id)}>{t('testPush')}</Button>
                <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingDs(ds); dsForm.setFieldsValue(ds); }} />
                <Popconfirm title={t('deleteConfirm')} onConfirm={async () => { await deleteDatasource(ds.id); loadData(); }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            </div>
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
          <Card size="small" style={{ borderStyle: 'dashed', textAlign: 'center', cursor: 'pointer', borderRadius: 6 }} onClick={() => { setEditingDs({}); dsForm.resetFields(); }}>
            <PlusOutlined /> {t('addDatasource')}
          </Card>
        )}
        {editingDs && !editingDs.id && (
          <Card size="small" style={{ marginTop: 8, borderRadius: 6 }}>
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

      {/* ── Dashboard Settings Modal ── */}
      <Modal title={currentDash?.id ? t('editDashboard') : t('newDashboard')} open={dashModalOpen} onCancel={() => setDashModalOpen(false)} onOk={() => dashForm.submit()} destroyOnClose>
        <Form form={dashForm} onFinish={onDashSubmit} layout="vertical">
          <Form.Item name="name" label={t('title')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label={t('description')}><Input /></Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="datasource_id" label={t('datasource')} style={{ flex: 1 }}>
              <Select allowClear options={datasources.map((d: any) => ({ label: d.name, value: d.id }))} />
            </Form.Item>
            <Form.Item name="time_range" label={t('defaultTimeRange')} style={{ flex: 1 }}>
              <Select options={timeRanges} />
            </Form.Item>
          </div>
          <Form.Item name="refresh_interval" label={t('refreshIntervalSec')}>
            <InputNumber min={10} max={300} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Panel Edit Modal ── */}
      <Modal title={editingPanel ? t('editPanel') : t('addPanel')} open={panelModalOpen} onCancel={() => setPanelModalOpen(false)} onOk={() => panelForm.submit()} width={600} destroyOnClose>
        <Form form={panelForm} onFinish={onPanelSubmit} layout="vertical">
          <Form.Item name="title" label={t('panelTitle')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="query" label="PromQL" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="up{job='node'}" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="type" label={t('chartType')} style={{ flex: 1 }}>
              <Select options={[
                { label: `📈 ${t('lineChart')}`, value: 'line' },
                { label: `🔢 ${t('statChart')}`, value: 'stat' },
                { label: `🎯 ${t('gaugeChart')}`, value: 'gauge' },
                { label: '📊 Table', value: 'table' },
                { label: '📏 Bar Gauge', value: 'bargauge' },
              ]} />
            </Form.Item>
            <Form.Item name="unit" label={t('unit')} style={{ flex: 1 }}>
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
            <Form.Item name="legend" label={t('legend')} style={{ flex: 1 }}><Input /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name={['grid', 'w']} label={t('width')} style={{ flex: 1 }}><InputNumber min={4} max={24} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name={['grid', 'h']} label={t('height')} style={{ flex: 1 }}><InputNumber min={2} max={20} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name={['grid', 'x']} label="X" style={{ flex: 1 }}><InputNumber min={0} max={24} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name={['grid', 'y']} label="Y" style={{ flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ── Import Grafana Dashboard ── */}
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
