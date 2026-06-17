const { db } = require('./database');
const { hashPassword, verifyPassword } = require('./auth');
const config = require('./config');

const LEGACY_WEAK_PASSWORDS = ['Admin@123456'];

const mapUserRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const getUserByUsernameStmt = db.prepare(`
  SELECT id, username, password_hash, role, created_at, updated_at
  FROM users
  WHERE username = ?
`);

const getUserByIdStmt = db.prepare(`
  SELECT id, username, password_hash, role, created_at, updated_at
  FROM users
  WHERE id = ?
`);

const insertUserStmt = db.prepare(`
  INSERT INTO users (username, password_hash, role, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);

const updateUserPasswordStmt = db.prepare(`
  UPDATE users
  SET password_hash = ?, updated_at = ?
  WHERE id = ?
`);

const userCountStmt = db.prepare(`
  SELECT COUNT(*) AS count
  FROM users
`);

const getUserByUsername = (username) => mapUserRow(getUserByUsernameStmt.get(username));
const getUserById = (id) => mapUserRow(getUserByIdStmt.get(id));

const createUser = ({ username, passwordHash, role = 'operator' }) => {
  const now = new Date().toISOString();
  const result = insertUserStmt.run(username, passwordHash, role, now, now);
  return getUserById(Number(result.lastInsertRowid));
};

const updateUserPassword = (id, passwordHash) => {
  const now = new Date().toISOString();
  updateUserPasswordStmt.run(passwordHash, now, id);
  return getUserById(id);
};

const hasAnyUser = () => Number(userCountStmt.get().count || 0) > 0;

const ensureDefaultAdminUser = () => {
  if (hasAnyUser()) {
    const existingAdmin = getUserByUsername(config.auth.bootstrapAdmin.username);
    if (
      existingAdmin &&
      !process.env.DEFAULT_ADMIN_PASSWORD &&
      !verifyPassword(config.auth.bootstrapAdmin.password, existingAdmin.passwordHash) &&
      LEGACY_WEAK_PASSWORDS.some((weakPassword) => verifyPassword(weakPassword, existingAdmin.passwordHash))
    ) {
      updateUserPassword(existingAdmin.id, hashPassword(config.auth.bootstrapAdmin.password));
      console.log(
        `检测到历史弱口令管理员账号，已自动轮换为运行时密钥文件中的密码: ${config.runtimeSecretsPath}`
      );
      return getUserById(existingAdmin.id);
    }

    return null;
  }

  const defaultUsername = config.auth.bootstrapAdmin.username;
  const admin = createUser({
    username: defaultUsername,
    passwordHash: hashPassword(config.auth.bootstrapAdmin.password),
    role: 'admin'
  });

  console.log(
    `已创建初始管理员账号: ${defaultUsername} (首次登录后请立即修改密码)`
  );
  console.log(`运行时密钥文件: ${config.runtimeSecretsPath}`);

  return admin;
};

module.exports = {
  getUserByUsername,
  getUserById,
  createUser,
  updateUserPassword,
  hasAnyUser,
  ensureDefaultAdminUser
};
