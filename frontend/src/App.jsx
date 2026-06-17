import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import './App.css';
import api from './services/api';
import useAuth from './hooks/useAuth';
import useRealtimeData from './hooks/useRealtimeData';
import AuthPanel from './components/AuthPanel';

const DigitalTwinScene = lazy(() => import('./components/DigitalTwinScene'));
const NetworkMetricsChart = lazy(() => import('./components/NetworkMetricsChart'));
const SignalMetricsChart = lazy(() => import('./components/SignalMetricsChart'));

const connectionLabels = {
  connected: '已连接',
  disconnected: '未连接',
  reconnecting: '重连中',
  error: '异常'
};

const connectionClasses = {
  connected: 'online',
  disconnected: 'offline',
  reconnecting: 'warning',
  error: 'danger'
};

const prettyTime = (timestamp) => {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

function App() {
  const {
    user,
    token,
    loading: authLoading,
    error: authError,
    login,
    register,
    logout
  } = useAuth();

  const {
    vehicles,
    metrics,
    events,
    detections,
    connections,
    loading,
    error,
    metricsSummary,
    refreshInitialData,
    pushEvent
  } = useRealtimeData({ token, user });

  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [controlForm, setControlForm] = useState({
    command: 'start',
    speed: 0.4,
    steering: 0,
    mode: 'auto'
  });
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

  useEffect(() => {
    if (vehicles.length === 0) {
      setSelectedVehicleId('');
      return;
    }

    const exists = vehicles.some((item) => item.vehicleId === selectedVehicleId);
    if (!selectedVehicleId || !exists) {
      setSelectedVehicleId(vehicles[0].vehicleId);
    }
  }, [selectedVehicleId, vehicles]);

  const selectedVehicle = useMemo(() => {
    return vehicles.find((item) => item.vehicleId === selectedVehicleId) || null;
  }, [selectedVehicleId, vehicles]);

  const filteredMetrics = useMemo(() => {
    if (!selectedVehicleId) {
      return metrics;
    }

    const target = metrics.filter((item) => item.vehicleId === selectedVehicleId);
    return target.length > 0 ? target : metrics;
  }, [metrics, selectedVehicleId]);

  const latestMetric = filteredMetrics.length > 0 ? filteredMetrics[filteredMetrics.length - 1] : null;

  const handleFormChange = (field, value) => {
    setControlForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePasswordFieldChange = (field, value) => {
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSendCommand = async (event) => {
    event.preventDefault();

    if (!selectedVehicleId) {
      setActionMessage('暂无可控制的车辆');
      return;
    }

    setSubmitting(true);
    setActionMessage('');

    try {
      const payload = {
        command: controlForm.command,
        speed: Number(controlForm.speed),
        steering: Number(controlForm.steering),
        mode: controlForm.mode
      };

      await api.sendVehicleControl(selectedVehicleId, payload);
      setActionMessage(`已发送 ${controlForm.command} 指令`);
      pushEvent('control', `Manual command ${controlForm.command} for ${selectedVehicleId}`, payload);
    } catch (requestError) {
      const message = requestError?.response?.data?.error || requestError?.message || '控制指令发送失败';
      setActionMessage(message);
      pushEvent('error', `Control request failed: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setPasswordMessage('');

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordMessage('请完整填写密码表单');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage('两次输入的新密码不一致');
      return;
    }

    setPasswordSubmitting(true);
    try {
      await api.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setPasswordMessage('密码修改成功');
      pushEvent('security', 'Password updated successfully');
    } catch (requestError) {
      const message = requestError?.response?.data?.error || requestError?.message || '密码修改失败';
      setPasswordMessage(message);
      pushEvent('error', `Password change failed: ${message}`);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  if (authLoading && !token) {
    return <div className="auth-loading">正在检查登录状态...</div>;
  }

  if (!token || !user) {
    return (
      <AuthPanel
        loading={authLoading}
        error={authError}
        onLogin={login}
        onRegister={register}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">YUCHI DIGITAL TWIN</p>
          <h1>驭驰编队控制与网络监测平台</h1>
        </div>
        <div className="top-actions">
          <button type="button" className="ghost-button" onClick={refreshInitialData}>
            刷新初始数据
          </button>
          <div className="connection-group">
            <span className={`state-badge ${connectionClasses[connections.ws] || 'offline'}`}>
              WS {connectionLabels[connections.ws] || connections.ws}
            </span>
            <span className={`state-badge ${connectionClasses[connections.mqtt] || 'offline'}`}>
              MQTT {connectionLabels[connections.mqtt] || connections.mqtt}
            </span>
          </div>
          <div className="user-actions">
            <span className="user-pill">{user.username} · {user.role}</span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setShowPasswordPanel((prev) => !prev)}
            >
              {showPasswordPanel ? '收起安全设置' : '修改密码'}
            </button>
            <button type="button" className="ghost-button" onClick={logout}>退出登录</button>
          </div>
        </div>
      </header>

      {error && <div className="error-banner">初始化失败: {error}</div>}

      {showPasswordPanel && (
        <section className="security-panel">
          <div className="panel-header">
            <h2>账户安全</h2>
            <span className="panel-note">建议登录后立即替换初始化密码</span>
          </div>
          <form className="security-form" onSubmit={handleChangePassword}>
            <label>
              当前密码
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => handlePasswordFieldChange('currentPassword', event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label>
              新密码
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) => handlePasswordFieldChange('newPassword', event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label>
              确认新密码
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => handlePasswordFieldChange('confirmPassword', event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button type="submit" disabled={passwordSubmitting} className="primary-button">
              {passwordSubmitting ? '提交中...' : '更新密码'}
            </button>
          </form>
          {passwordMessage && <p className="action-message">{passwordMessage}</p>}
        </section>
      )}

      <section className="summary-grid">
        <article className="summary-card">
          <p>在线车辆</p>
          <h3>{vehicles.length}</h3>
        </article>
        <article className="summary-card">
          <p>平均时延</p>
          <h3>{metricsSummary.averageLatency} ms</h3>
        </article>
        <article className="summary-card">
          <p>平均吞吐</p>
          <h3>{metricsSummary.averageThroughput} Mbps</h3>
        </article>
        <article className="summary-card">
          <p>平均 RSRP</p>
          <h3>{metricsSummary.averageRsrp} dBm</h3>
        </article>
        <article className="summary-card">
          <p>平均 SINR</p>
          <h3>{metricsSummary.averageSinr} dB</h3>
        </article>
      </section>

      <section className="workspace-grid">
        <section className="panel twin-panel">
          <div className="panel-header">
            <h2>数字孪生视图</h2>
            <span className="panel-note">点击车辆可切换控制目标</span>
          </div>
          <Suspense fallback={<div className="panel-loading">加载 3D 场景中...</div>}>
            <DigitalTwinScene
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={setSelectedVehicleId}
            />
          </Suspense>
          <div className="vehicle-strip">
            {vehicles.map((vehicle) => (
              <button
                key={vehicle.vehicleId}
                type="button"
                className={`vehicle-chip ${vehicle.vehicleId === selectedVehicleId ? 'active' : ''}`}
                onClick={() => setSelectedVehicleId(vehicle.vehicleId)}
              >
                <strong>{vehicle.name || vehicle.vehicleId}</strong>
                <span>{vehicle.mode || 'manual'} · {vehicle.status || 'idle'}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="side-column">
          <section className="panel control-panel">
            <div className="panel-header">
              <h2>车辆控制台</h2>
              <span className="panel-note">目标: {selectedVehicleId || '未选中'}</span>
            </div>

            {selectedVehicle ? (
              <div className="vehicle-meta">
                <div><span>速度</span><strong>{Number(selectedVehicle.speed || 0).toFixed(2)} m/s</strong></div>
                <div><span>电量</span><strong>{Number(selectedVehicle.battery || 0).toFixed(1)}%</strong></div>
                <div><span>姿态</span><strong>{Number(selectedVehicle.rotation || 0).toFixed(1)}°</strong></div>
                <div><span>状态</span><strong>{selectedVehicle.status || 'idle'}</strong></div>
              </div>
            ) : (
              <p className="placeholder-text">暂无车辆数据</p>
            )}

            <form className="control-form" onSubmit={handleSendCommand}>
              <label>
                指令
                <select
                  value={controlForm.command}
                  onChange={(event) => handleFormChange('command', event.target.value)}
                >
                  <option value="start">start</option>
                  <option value="stop">stop</option>
                  <option value="emergency_stop">emergency_stop</option>
                  <option value="lane_change">lane_change</option>
                </select>
              </label>

              <label>
                控制模式
                <select
                  value={controlForm.mode}
                  onChange={(event) => handleFormChange('mode', event.target.value)}
                >
                  <option value="auto">auto</option>
                  <option value="manual">manual</option>
                  <option value="platoon">platoon</option>
                </select>
              </label>

              <label>
                目标速度 (m/s)
                <input
                  type="number"
                  min="0"
                  max="2.5"
                  step="0.01"
                  value={controlForm.speed}
                  onChange={(event) => handleFormChange('speed', event.target.value)}
                />
              </label>

              <label>
                转向角 (deg)
                <input
                  type="number"
                  min="-45"
                  max="45"
                  step="0.1"
                  value={controlForm.steering}
                  onChange={(event) => handleFormChange('steering', event.target.value)}
                />
              </label>

              <button type="submit" disabled={submitting} className="primary-button">
                {submitting ? '发送中...' : '发送控制命令'}
              </button>
            </form>

            {actionMessage && <p className="action-message">{actionMessage}</p>}

            {latestMetric && (
              <div className="metric-highlight">
                <p>最新链路 ({latestMetric.vehicleId})</p>
                <strong>
                  {latestMetric.latency.toFixed(2)} ms / {latestMetric.throughput.toFixed(2)} Mbps / {latestMetric.packetLoss.toFixed(3)}%
                </strong>
              </div>
            )}
          </section>

          <section className="panel event-panel">
            <div className="panel-header">
              <h2>事件流</h2>
              <span className="panel-note">最近 {events.length} 条</span>
            </div>

            <div className="event-list">
              {events.length === 0 && <p className="placeholder-text">等待实时事件...</p>}
              {events.map((item) => (
                <article key={item.id} className="event-item">
                  <header>
                    <span className={`event-tag ${item.kind}`}>{item.kind}</span>
                    <time>{prettyTime(item.timestamp)}</time>
                  </header>
                  <p>{item.message}</p>
                </article>
              ))}
            </div>

            <div className="detection-block">
              <h4>最近感知结果</h4>
              {detections.length === 0 && <p className="placeholder-text">暂无 YOLO 结果</p>}
              {detections.slice(0, 3).map((item) => (
                <div key={item.id} className="detection-item">
                  <strong>{item.vehicleId}</strong>
                  <span>{item.detections.map((d) => d.class).join(', ')}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="charts-grid">
        <Suspense fallback={<div className="panel chart-panel panel-loading">加载图表中...</div>}>
          <NetworkMetricsChart metrics={filteredMetrics} title={`网络传输指标 (${selectedVehicleId || 'ALL'})`} />
        </Suspense>
        <Suspense fallback={<div className="panel chart-panel panel-loading">加载图表中...</div>}>
          <SignalMetricsChart metrics={filteredMetrics} title={`无线信号质量 (${selectedVehicleId || 'ALL'})`} />
        </Suspense>
      </section>

      {loading && <div className="floating-loading">正在加载系统数据...</div>}
    </div>
  );
}

export default App;
