const crypto = require('crypto');
const config = require('./config');

const TOKEN_SECRET = config.auth.tokenSecret;
const TOKEN_TTL_SECONDS = config.auth.tokenTtlSeconds;
const TOKEN_ISSUER = 'yuchi-system';
const TOKEN_AUDIENCE = 'yuchi-clients';

const toBase64Url = (input) => Buffer.from(input).toString('base64url');
const fromBase64Url = (input) => Buffer.from(input, 'base64url').toString('utf8');

const constantTimeEqualText = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, encodedPassword) => {
  if (!encodedPassword || typeof encodedPassword !== 'string') {
    return false;
  }

  const [salt, existingHash] = encodedPassword.split(':');
  if (!salt || !existingHash) {
    return false;
  }

  const candidateHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const left = Buffer.from(candidateHash, 'hex');
  const right = Buffer.from(existingHash, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const issueAccessToken = (payload) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(body));
  const digest = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${digest}`;
};

const verifyAccessToken = (token) => {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expected = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload));
  if (payload.iss !== TOKEN_ISSUER || payload.aud !== TOKEN_AUDIENCE) {
    throw new Error('Invalid token audience');
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
};

const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/);
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
};

const requireAuth = (req, res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ success: false, error: '缺少访问令牌' });
    }

    const payload = verifyAccessToken(token);
    req.auth = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, error: '令牌无效或已过期' });
  }
};

module.exports = {
  TOKEN_TTL_SECONDS,
  sanitizeUser,
  hashPassword,
  verifyPassword,
  issueAccessToken,
  verifyAccessToken,
  extractBearerToken,
  requireAuth,
  constantTimeEqualText
};
