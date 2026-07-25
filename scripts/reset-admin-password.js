require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const PASSWORD_ROUNDS = Number(process.env.PASSWORD_ROUNDS || 12);
const DATABASE_URL = process.env.DATABASE_URL || '';
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(DATA_DIR, 'database.json');

function getTemporaryPassword() {
  const providedPassword = process.argv[2] ? String(process.argv[2]).trim() : '';
  if (providedPassword) return providedPassword;
  return `Admin@${crypto.randomBytes(4).toString('hex')}`;
}

function validatePassword(password) {
  if (password.length < 8) {
    throw new Error('A senha temporaria precisa ter no minimo 8 caracteres.');
  }
}

function resetAdminUser(data, temporaryPassword) {
  if (!data || !Array.isArray(data.users)) {
    throw new Error('Banco de dados invalido: lista de usuarios nao encontrada.');
  }

  const admin = data.users.find(user => String(user.username || '').toLowerCase() === 'admin');
  if (!admin) {
    throw new Error('Usuario admin nao encontrado no banco de dados.');
  }

  admin.passwordHash = bcrypt.hashSync(temporaryPassword, PASSWORD_ROUNDS);
  admin.mustChangePassword = true;
  return admin;
}

function resetJsonDatabase(temporaryPassword) {
  if (!fs.existsSync(DB_FILE)) {
    throw new Error(`Banco de dados local nao encontrado em: ${DB_FILE}`);
  }

  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const admin = resetAdminUser(data, temporaryPassword);
  const tmpFile = `${DB_FILE}.tmp`;

  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);

  return admin;
}

async function resetPostgresDatabase(temporaryPassword) {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  });

  try {
    const result = await pool.query('select value from app_state where key = $1', ['main']);
    if (result.rows.length === 0) {
      throw new Error('Registro principal do sistema nao encontrado no PostgreSQL/Supabase.');
    }

    const data = result.rows[0].value;
    const admin = resetAdminUser(data, temporaryPassword);

    await pool.query(
      `
        update app_state
        set value = $1::jsonb, updated_at = now()
        where key = $2
      `,
      [JSON.stringify(data), 'main']
    );

    return admin;
  } finally {
    await pool.end();
  }
}

async function main() {
  const temporaryPassword = getTemporaryPassword();
  validatePassword(temporaryPassword);

  const admin = DATABASE_URL
    ? await resetPostgresDatabase(temporaryPassword)
    : resetJsonDatabase(temporaryPassword);

  console.log('Senha do administrador redefinida com sucesso.');
  console.log(`Usuario: ${admin.username}`);
  console.log(`Senha temporaria: ${temporaryPassword}`);
  console.log('No proximo login, o sistema vai exigir o cadastro de uma nova senha.');
}

main().catch(err => {
  console.error(`Erro ao redefinir senha do administrador: ${err.message}`);
  process.exit(1);
});
