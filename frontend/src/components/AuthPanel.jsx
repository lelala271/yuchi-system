import { useState } from 'react';

function AuthPanel({ loading, error, onLogin, onRegister }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    username: '',
    password: ''
  });
  const [message, setMessage] = useState('');

  const setField = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');

    if (!form.username || !form.password) {
      setMessage('请填写用户名和密码');
      return;
    }

    const action = mode === 'login' ? onLogin : onRegister;
    const result = await action({ username: form.username.trim(), password: form.password });
    if (!result.success && result.message) {
      setMessage(result.message);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow">YUCHI ACCESS GATE</p>
        <h1>{mode === 'login' ? '登录平台' : '创建账号'}</h1>
        <p className="auth-tip">
          首次部署请查看后端启动日志或运行时密钥文件中的初始管理员凭据。
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            用户名
            <input
              type="text"
              value={form.username}
              onChange={(event) => setField('username', event.target.value)}
              autoComplete="username"
            />
          </label>

          <label>
            密码
            <input
              type="password"
              value={form.password}
              onChange={(event) => setField('password', event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>

        {(message || error) && <p className="auth-error">{message || error}</p>}
      </div>
    </div>
  );
}

export default AuthPanel;
