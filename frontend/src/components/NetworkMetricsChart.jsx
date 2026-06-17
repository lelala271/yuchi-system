import { useEffect, useMemo, useRef } from 'react';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { use as registerEchartsComponents } from 'echarts/core';
import * as echarts from 'echarts/core';

registerEchartsComponents([
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
]);

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

function NetworkMetricsChart({ metrics, title = '网络传输指标' }) {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);

  const chartData = useMemo(() => {
    const items = metrics.slice(-60);
    return {
      times: items.map((item) => formatTime(item.timestamp)),
      latency: items.map((item) => Number(item.latency || 0).toFixed(2)),
      packetLoss: items.map((item) => Number(item.packetLoss || 0).toFixed(3)),
      throughput: items.map((item) => Number(item.throughput || 0).toFixed(2))
    };
  }, [metrics]);

  useEffect(() => {
    if (!chartRef.current) {
      return undefined;
    }

    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartInstanceRef.current) {
      return;
    }

    chartInstanceRef.current.setOption({
      animation: true,
      grid: {
        left: 40,
        right: 44,
        top: 50,
        bottom: 30
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        top: 10,
        textStyle: { color: '#1e293b' }
      },
      xAxis: {
        type: 'category',
        data: chartData.times,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#94a3b8' } },
        axisLabel: { color: '#334155' }
      },
      yAxis: [
        {
          type: 'value',
          name: '时延/丢包',
          axisLine: { show: true, lineStyle: { color: '#334155' } },
          splitLine: { lineStyle: { color: '#e2e8f0' } },
          axisLabel: { color: '#334155' }
        },
        {
          type: 'value',
          name: '吞吐(Mbps)',
          axisLine: { show: true, lineStyle: { color: '#334155' } },
          splitLine: { show: false },
          axisLabel: { color: '#334155' }
        }
      ],
      series: [
        {
          name: '时延(ms)',
          type: 'line',
          smooth: true,
          symbol: 'none',
          yAxisIndex: 0,
          data: chartData.latency,
          lineStyle: { width: 2, color: '#ef4444' },
          areaStyle: { color: 'rgba(239,68,68,0.08)' }
        },
        {
          name: '丢包(%)',
          type: 'line',
          smooth: true,
          symbol: 'none',
          yAxisIndex: 0,
          data: chartData.packetLoss,
          lineStyle: { width: 2, color: '#f59e0b' }
        },
        {
          name: '吞吐(Mbps)',
          type: 'line',
          smooth: true,
          symbol: 'none',
          yAxisIndex: 1,
          data: chartData.throughput,
          lineStyle: { width: 2, color: '#0ea5e9' },
          areaStyle: { color: 'rgba(14,165,233,0.09)' }
        }
      ]
    });
  }, [chartData]);

  return (
    <section className="panel chart-panel">
      <div className="panel-header">
        <h3>{title}</h3>
      </div>
      <div className="chart-canvas" ref={chartRef} />
    </section>
  );
}

export default NetworkMetricsChart;
