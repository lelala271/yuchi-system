const { URL } = require('url');
const config = require('./config');

const getForwardedValue = (value) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return String(value || '').split(',')[0].trim();
};

const getRequestHost = (req) => {
  return getForwardedValue(req.headers['x-forwarded-host']) || getForwardedValue(req.headers.host);
};

const getRequestProtocol = (req) => {
  return getForwardedValue(req.headers['x-forwarded-proto']) || (req.socket.encrypted ? 'https' : 'http');
};

const isAllowedOrigin = (origin, req) => {
  if (!origin) {
    return true;
  }

  if (config.http.corsOrigins.includes(origin)) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);
    const requestHost = getRequestHost(req);
    const requestProtocol = getRequestProtocol(req);
    return parsedOrigin.host === requestHost && parsedOrigin.protocol === `${requestProtocol}:`;
  } catch (error) {
    return false;
  }
};

const createCorsMiddleware = () => {
  return (req, res, next) => {
    const origin = req.headers.origin;
    const originAllowed = isAllowedOrigin(origin, req);

    if (origin && !originAllowed) {
      return res.status(403).json({ success: false, error: '跨域来源未被允许' });
    }

    if (origin && originAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return next();
  };
};

const applySecurityHeaders = (req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
};

const getClientIp = (req) => {
  const forwarded = getForwardedValue(req.headers['x-forwarded-for']);
  return forwarded || req.socket.remoteAddress || 'unknown';
};

const sendUnexpectedError = (res, error, publicMessage = '服务器内部错误') => {
  console.error(error);
  return res.status(500).json({
    success: false,
    error: config.isProduction ? publicMessage : `${publicMessage}: ${error.message}`
  });
};

module.exports = {
  applySecurityHeaders,
  createCorsMiddleware,
  getClientIp,
  getRequestHost,
  getRequestProtocol,
  isAllowedOrigin,
  sendUnexpectedError
};
