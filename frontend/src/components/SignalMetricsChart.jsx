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

function SignalMetricsChart({ metrics, title = '无线链路质量' }) {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);

  const chartData = useMemo(() => {
    const items = metrics.slice(-60);
    return {
      times: items.map((item) => formatTime(item.timestamp)),
      rsrp: items.map((item) => Number(item.rsrp || -95).toFixed(2)),
      sinr: items.map((item) => Number(item.sinr || 0).toFixed(2))
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
      grid: {
        left: 44,
        right: 28,
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
        boundaryGap: false,
        data: chartData.times,
        axisLabel: { color: '#334155' },
        axisLine: { lineStyle: { color: '#94a3b8' } }
      },
      yAxis: [
        {
          type: 'value',
          name: 'RSRP(dBm)',
          axisLabel: { color: '#334155' },
          splitLine: { lineStyle: { color: '#e2e8f0' } }
        },
        {
          type: 'value',
          name: 'SINR(dB)',
          axisLabel: { color: '#334155' },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: 'RSRP(dBm)',
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: chartData.rsrp,
          yAxisIndex: 0,
          lineStyle: { color: '#7c3aed', width: 2 },
          areaStyle: { color: 'rgba(124,58,237,0.08)' }
        },
        {
          name: 'SINR(dB)',
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: chartData.sinr,
          yAxisIndex: 1,
          lineStyle: { color: '#16a34a', width: 2 }
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

export default SignalMetricsChart;
