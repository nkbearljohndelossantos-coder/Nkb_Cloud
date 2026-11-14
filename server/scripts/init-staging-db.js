import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgres://postgres:IsolatedStagingSecret2026!@127.0.0.1:5433/postgres'
});

async function main() {
  await client.connect();
  const check = await client.query("SELECT 1 FROM pg_database WHERE datname = 'nkb_drive_staging';");
  if (check.rows.length === 0) {
    await client.query("CREATE DATABASE nkb_drive_staging;");
    console.log("Database nkb_drive_staging created successfully.");
  } else {
    console.log("Database nkb_drive_staging already exists.");
  }
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
