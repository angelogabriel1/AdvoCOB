require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurado.');
  }

  const schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  });

  try {
    await pool.query(schema);
    console.log('Schema relacional aplicado com sucesso.');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Erro ao aplicar schema:', err.message);
  process.exit(1);
});
