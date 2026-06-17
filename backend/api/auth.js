const express = require('express');
const config = require('../config');
const {
  sanitizeUser,
  hashPassword,
  verifyPassword,
  issueAccessToken,
  requireAuth
} = require('../auth');
const {
  createUser,
  getUserById,
  getUserByUsername,
  updateUserPassword
} = require('../user-store');
const { sendUnexpectedError } = require('../http-utils');
const { ValidationError, validatePassword, validateUsername } = require('../validation');

const router = express.Router();

router.post('/register', (req, res) => {
  try {
    if (!config.auth.allowRegistration) {
      return res.status(403).json({ success: false, error: '当前环境禁止注册新账号' });
    }

    const { username, password } = req.body || {};
    const safeUsername = validateUsername(username);
    validatePassword(password);

    if (getUserByUsername(safeUsername)) {
      return res.status(409).json({ success: false, error: '用户名已存在' });
    }

    const user = createUser({
      username: safeUsername,
      passwordHash: hashPassword(password),
      role: 'operator'
    });

    const token = issueAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    return res.json({
      success: true,
      data: {
        user: sanitizeUser(user),
        token
      }
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return sendUnexpectedError(res, error, '注册失败');
  }
});

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    const safeUsername = validateUsername(username);
    if (!password) {
      return res.status(400).json({ success: false, error: '请输入用户名和密码' });
    }

    const user = getUserByUsername(safeUsername);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }

    const token = issueAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    return res.json({
      success: true,
      data: {
        user: sanitizeUser(user),
        token
      }
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return sendUnexpectedError(res, error, '登录失败');
  }
});

router.get('/me', requireAuth, (req, res) => {
  try {
    const user = getUserById(req.auth.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    return res.json({
      success: true,
      data: sanitizeUser(user)
    });
  } catch (error) {
    return sendUnexpectedError(res, error, '读取用户信息失败');
  }
});

router.post('/change-password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: '请输入当前密码和新密码' });
    }

    validatePassword(newPassword, '新密码');
    const user = getUserById(req.auth.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(401).json({ success: false, error: '当前密码错误' });
    }

    if (verifyPassword(newPassword, user.passwordHash)) {
      return res.status(400).json({ success: false, error: '新密码不能与当前密码相同' });
    }

    const updatedUser = updateUserPassword(user.id, hashPassword(newPassword));
    return res.json({
      success: true,
      data: sanitizeUser(updatedUser)
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return sendUnexpectedError(res, error, '修改密码失败');
  }
});

module.exports = router;
