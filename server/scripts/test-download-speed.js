import pg from 'pg';
import jwt from 'jsonwebtoken';

async function main() {
  const pool = new pg.Pool({ connectionString: 'postgres://postgres:IsolatedStagingSecret2026!@127.0.0.1:5433/nkb_drive_staging' });
  const userRes = await pool.query("SELECT * FROM users WHERE email = 'admin@nkbmanufacturing.com'");
  const user = userRes.rows[0];
  const fileRes = await pool.query("SELECT id, name, size_bytes FROM files ORDER BY created_at DESC LIMIT 1");
  const file = fileRes.rows[0];
  console.log('Testing download for file:', file);

  const token = jwt.sign({
    id: user.id,
    email: user.email,
    role: 'SUPER ADMIN',
    sessionVersion: 1
  }, '4f9b2a7e18c53d9e0b82f6a14c3e7d59b02a1e8c4d3b6f9a7e0c2d4b8a1e3f5c', { expiresIn: '1h' });

  const t0 = Date.now();
  const resp = await fetch(`http://127.0.0.1:5000/api/files/${file.id}/download`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const buf = await resp.arrayBuffer();
  const elapsed = Date.now() - t0;
  console.log(`Download Status: ${resp.status}, Received: ${buf.byteLength} bytes in ${elapsed}ms`);
  await pool.end();
}

main().catch(console.error);
