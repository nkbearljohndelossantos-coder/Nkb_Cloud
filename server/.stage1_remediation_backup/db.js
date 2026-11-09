import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;

class DatabaseManager {
  constructor() {
    this.mode = 'uninitialized';
    this.pool = null;
    this.embeddedStore = null;
    this.embeddedFilePath = path.join(__dirname, '..', 'data', 'nkb_cloud_db.json');
  }

  async initialize() {
    // Check if PostgreSQL is available / configured
    if (databaseUrl || (process.env.PGHOST && process.env.PGUSER)) {
      try {
        console.log('[DB] Attempting connection to PostgreSQL...');
        this.pool = new pg.Pool({
          connectionString: databaseUrl,
          host: process.env.PGHOST,
          port: parseInt(process.env.PGPORT || '5432'),
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE || 'nkb_cloud',
          connectionTimeoutMillis: 3000,
        });

        const client = await this.pool.connect();
        console.log('[DB] Successfully connected to PostgreSQL instance.');
        client.release();
        this.mode = 'postgres';
        await this.runPgMigrations();
        return;
      } catch (err) {
        console.warn('[DB] PostgreSQL connection failed:', err.message);
        if (isProduction) {
          throw err;
        }
        console.log('[DB] Falling back to embedded persistent database engine for development/local execution.');
      }
    } else {
      console.log('[DB] No PostgreSQL configuration detected in environment. Using embedded database engine.');
    }

    this.mode = 'embedded';
    await this.initEmbeddedStore();
  }

  async runPgMigrations() {
    try {
      const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
      const seedPath = path.join(__dirname, '..', 'db', 'seed.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await this.pool.query(schemaSql);
        console.log('[DB] PostgreSQL schema checked/applied.');
      }
      if (fs.existsSync(seedPath)) {
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        await this.pool.query(seedSql);
        console.log('[DB] PostgreSQL seed data checked/applied.');
      }
    } catch (err) {
      console.error('[DB] PostgreSQL migration error:', err);
    }
  }

  async initEmbeddedStore() {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(this.embeddedFilePath)) {
      try {
        const raw = fs.readFileSync(this.embeddedFilePath, 'utf8');
        this.embeddedStore = JSON.parse(raw);
        this.ensureEmbeddedTableKeys();
        console.log('[DB] Loaded existing embedded database from disk.');
        return;
      } catch (err) {
        console.warn('[DB] Corrupted DB file, recreating store.');
      }
    }

    // Default Seed Data for embedded mode
    const defaultSalt = bcrypt.genSaltSync(10);
    const superAdminPasswordHash = bcrypt.hashSync('Admin@NKB2026!', defaultSalt);

    this.embeddedStore = {
      roles: [
        { id: 1, name: 'SUPER ADMIN', description: 'Unrestricted administrative access to all files, storage drives, users, and audit logs' },
        { id: 2, name: 'ADMIN', description: 'Management of authorized department users, folders, and assigned storage areas' },
        { id: 3, name: 'STANDARD USER', description: 'Personal workspace, upload, download, and standard authorized sharing' },
        { id: 4, name: 'VIEWER', description: 'Read-only preview and authorized download privileges' }
      ],
      departments: [
        { id: 1, name: 'Executive & Leadership', code: 'EXEC', description: 'Executive management and leadership team' },
        { id: 2, name: 'IT & Systems Infrastructure', code: 'IT', description: 'Information technology, cloud storage, and systems management' },
        { id: 3, name: 'Manufacturing & Operations', code: 'MFG', description: 'Plant operations, machine specs, and manufacturing records' },
        { id: 4, name: 'Quality Assurance & Control', code: 'QA', description: 'Quality inspections, ISO compliance, and audit records' },
        { id: 5, name: 'Engineering & Design', code: 'ENG', description: 'Product blueprints, CAD drawings, and technical specs' },
        { id: 6, name: 'Finance & Human Resources', code: 'FHR', description: 'Financial ledgers, payroll, and corporate compliance' }
      ],
      users: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          username: 'superadmin',
          email: 'admin@nkbmanufacturing.com',
          password_hash: superAdminPasswordHash,
          full_name: 'NKB Super Administrator',
          avatar_url: null,
          role_id: 1,
          department_id: 2,
          status: 'ACTIVE',
          storage_quota_bytes: 10995116277760, // 10 TB
          used_storage_bytes: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ],
      permissions: [
        { id: 1, name: 'storage:view', module: 'STORAGE' },
        { id: 2, name: 'storage:manage', module: 'STORAGE' },
        { id: 3, name: 'storage:migrate', module: 'STORAGE' },
        { id: 4, name: 'storage:integrity', module: 'STORAGE' },
        { id: 5, name: 'users:view', module: 'USERS' },
        { id: 6, name: 'users:manage', module: 'USERS' },
        { id: 7, name: 'files:read', module: 'FILES' },
        { id: 8, name: 'files:upload', module: 'FILES' },
        { id: 9, name: 'files:delete', module: 'FILES' },
        { id: 10, name: 'files:share', module: 'SHARING' },
        { id: 11, name: 'audit:view', module: 'AUDIT' },
        { id: 12, name: 'dlp:view', module: 'DLP' },
        { id: 13, name: 'dlp:run', module: 'DLP' },
        { id: 14, name: 'settings:manage', module: 'SETTINGS' }
      ],
      role_permissions: [],
      storage_agents: [],
      agent_credentials: [],
      agent_nonce_registry: [],
      agent_heartbeats: [],
      storage_devices: [],
      storage_volumes: [],
      storage_registrations: [],
      storage_identity_observations: [],
      storage_identity_conflicts: [],
      storage_mount_history: [],
      storage_health_logs: [],
      agent_commands: [],
      agent_command_results: [],
      agent_command_queue: [],
      folders: [],
      files: [],
      file_versions: [],
      file_chunks: [],
      file_checksums: [],
      upload_sessions: [],
      file_shares: [],
      file_permissions: [],
      storage_integrity_jobs: [],
      storage_integrity_results: [],
      migration_jobs: [],
      migration_file_results: [],
      storage_migrations: [],
      recycle_bin: [],
      download_logs: [],
      audit_logs: [],
      dlp_test_runs: [
        {
          id: '00000000-0000-0000-0000-000000000099',
          test_suite_name: 'NKB Cloud Non-Negotiable DLP Test Matrix v2.1.0',
          execution_id: 'DLP-BASELINE-INIT-2026',
          overall_status: 'NOT_TESTED',
          created_at: new Date().toISOString()
        }
      ],
      dlp_test_evidence: [
        { id: 'dlp-01', requirement_key: 'DLP-01', verification_status: 'NOT_TESTED' },
        { id: 'dlp-02', requirement_key: 'DLP-02', verification_status: 'NOT_TESTED' },
        { id: 'dlp-03', requirement_key: 'DLP-03', verification_status: 'NOT_TESTED' },
        { id: 'dlp-04', requirement_key: 'DLP-04', verification_status: 'NOT_TESTED' },
        { id: 'dlp-05', requirement_key: 'DLP-05', verification_status: 'NOT_TESTED' },
        { id: 'dlp-06', requirement_key: 'DLP-06', verification_status: 'NOT_TESTED' },
        { id: 'dlp-07', requirement_key: 'DLP-07', verification_status: 'NOT_TESTED' },
        { id: 'dlp-08', requirement_key: 'DLP-08', verification_status: 'NOT_TESTED' },
        { id: 'dlp-09', requirement_key: 'DLP-09', verification_status: 'NOT_TESTED' },
        { id: 'dlp-10', requirement_key: 'DLP-10', verification_status: 'NOT_TESTED' },
        { id: 'dlp-11', requirement_key: 'DLP-11', verification_status: 'NOT_TESTED' }
      ],
      schema_migrations: [],
      system_settings: [
        { setting_key: 'app_name', setting_value: 'NKB Cloud', data_type: 'STRING', category: 'BRANDING' },
        { setting_key: 'storage_placement_policy', setting_value: 'PRIORITY_POOL', data_type: 'STRING', category: 'STORAGE' },
        { setting_key: 'max_upload_size_bytes', setting_value: '53687091200', data_type: 'INTEGER', category: 'STORAGE' },
        { setting_key: 'allowed_mime_types', setting_value: '*', data_type: 'STRING', category: 'SECURITY' },
        { setting_key: 'restricted_extensions', setting_value: 'exe,bat,cmd,sh,vbs,ps1,msi', data_type: 'STRING', category: 'SECURITY' },
        { setting_key: 'chunk_size_bytes', setting_value: '10485760', data_type: 'INTEGER', category: 'PERFORMANCE' },
        { setting_key: 'agent_command_ttl_ms', setting_value: '60000', data_type: 'INTEGER', category: 'SECURITY' },
        { setting_key: 'agent_nonce_ttl_seconds', setting_value: '300', data_type: 'INTEGER', category: 'SECURITY' },
        { setting_key: 'require_tls13', setting_value: 'true', data_type: 'BOOLEAN', category: 'SECURITY' },
        { setting_key: 'allowlist_strict_mode', setting_value: 'true', data_type: 'BOOLEAN', category: 'SECURITY' },
        { setting_key: 'retention_recycle_days', setting_value: '30', data_type: 'INTEGER', category: 'STORAGE' },
        { setting_key: 'require_share_passwords', setting_value: 'false', data_type: 'BOOLEAN', category: 'SHARING' },
        { setting_key: 'default_share_expiry_days', setting_value: '7', data_type: 'INTEGER', category: 'SHARING' },
        { setting_key: 'backup_disclaimer_acknowledged', setting_value: 'true', data_type: 'BOOLEAN', category: 'STORAGE' }
      ]
    };

    this.saveEmbeddedStore();
    console.log('[DB] Embedded store initialized with default NKB Manufacturing seeds.');
  }

  ensureEmbeddedTableKeys() {
    const requiredTables = [
      'roles', 'permissions', 'role_permissions', 'departments', 'users',
      'storage_agents', 'agent_credentials', 'agent_nonce_registry', 'agent_heartbeats',
      'storage_devices', 'storage_volumes', 'storage_registrations',
      'storage_identity_observations', 'storage_identity_conflicts',
      'storage_mount_history', 'storage_health_logs',
      'agent_commands', 'agent_command_results', 'agent_command_queue',
      'folders', 'files', 'file_versions', 'file_chunks', 'file_checksums',
      'upload_sessions', 'file_shares', 'file_permissions',
      'storage_integrity_jobs', 'storage_integrity_results',
      'migration_jobs', 'migration_file_results', 'storage_migrations',
      'recycle_bin', 'download_logs', 'audit_logs',
      'dlp_test_runs', 'dlp_test_evidence', 'system_settings', 'schema_migrations'
    ];
    for (const tbl of requiredTables) {
      if (!this.embeddedStore[tbl]) {
        this.embeddedStore[tbl] = [];
      }
    }
  }

  saveEmbeddedStore() {
    if (this.mode !== 'embedded' || !this.embeddedStore) return;
    try {
      fs.writeFileSync(this.embeddedFilePath, JSON.stringify(this.embeddedStore, null, 2), 'utf8');
    } catch (err) {
      console.error('[DB] Failed to persist embedded store:', err);
    }
  }

  // Universal query execution
  async query(text, params = []) {
    if (this.mode === 'postgres') {
      const res = await this.pool.query(text, params);
      return res;
    }

    // Embedded store query parser & runner
    return this.runEmbeddedQuery(text, params);
  }

  runEmbeddedQuery(sql, params) {
    const trimmed = sql.trim();
    const store = this.embeddedStore;

    // Helper: substitute $1, $2 with params
    const getParam = (idx) => params[idx - 1];

    // SELECT queries
    if (/^SELECT/i.test(trimmed)) {
      return this.handleEmbeddedSelect(trimmed, params);
    }

    // INSERT queries
    if (/^INSERT INTO/i.test(trimmed)) {
      return this.handleEmbeddedInsert(trimmed, params);
    }

    // UPDATE queries
    if (/^UPDATE/i.test(trimmed)) {
      return this.handleEmbeddedUpdate(trimmed, params);
    }

    // DELETE queries
    if (/^DELETE FROM/i.test(trimmed)) {
      return this.handleEmbeddedDelete(trimmed, params);
    }

    return { rows: [], rowCount: 0 };
  }

  handleEmbeddedSelect(sql, params) {
    const store = this.embeddedStore;
    const lower = sql.toLowerCase();

    // Check target table
    const tableMatch = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };
    const tableName = tableMatch[1].toLowerCase();
    let records = store[tableName] || [];

    // Clone records so we don't mutate in place
    let results = records.map(r => ({ ...r }));

    // Custom join / enrichments
    if (tableName === 'users') {
      results = results.map(u => {
        const role = store.roles.find(r => r.id === u.role_id);
        const dept = store.departments.find(d => d.id === u.department_id);
        return {
          ...u,
          role_name: role ? role.name : 'STANDARD USER',
          department_name: dept ? dept.name : null,
          department_code: dept ? dept.code : null
        };
      });
    }

    if (tableName === 'files') {
      results = results.map(f => {
        const vol = store.storage_volumes.find(v => v.id === f.storage_volume_id);
        const owner = store.users.find(u => u.id === f.owner_id);
        return {
          ...f,
          volume_assigned_name: vol ? vol.assigned_name : 'Unknown Volume',
          volume_status: vol ? vol.status : 'OFFLINE',
          owner_name: owner ? owner.full_name : 'Unknown',
          owner_email: owner ? owner.email : 'Unknown'
        };
      });
    }

    if (tableName === 'storage_volumes') {
      results = results.map(v => {
        const dev = store.storage_devices.find(d => d.id === v.device_id);
        const agent = dev ? store.storage_agents.find(a => a.id === dev.agent_id) : null;
        return {
          ...v,
          device_vendor: dev ? dev.vendor : '',
          device_model: dev ? dev.model : '',
          device_bus_type: dev ? dev.bus_type : '',
          device_media_type: dev ? dev.media_type : '',
          device_health: dev ? dev.health_status : 'GOOD',
          agent_name: agent ? agent.agent_name : '',
          agent_status: agent ? agent.status : 'OFFLINE'
        };
      });
    }

    // Dynamic WHERE filter matching
    results = results.filter(row => {
      // Check each parameter reference $1, $2 etc.
      for (let i = 1; i <= params.length; i++) {
        const placeholder = `$${i}`;
        const val = params[i - 1];

        // Match column = $i
        const colMatch = new RegExp(`([a-zA-Z0-9_]+)\\s*(=|ILIKE|LIKE|IS)\\s*\\${placeholder}`, 'i').exec(sql);
        if (colMatch) {
          const col = colMatch[1];
          const op = colMatch[2].toUpperCase();
          if (op === '=' && row[col] != val) return false;
          if ((op === 'LIKE' || op === 'ILIKE') && typeof row[col] === 'string') {
            const pattern = String(val).replace(/%/g, '.*');
            if (!new RegExp(pattern, 'i').test(row[col])) return false;
          }
        }
      }

      // Explicit filters written directly in SQL
      if (sql.includes('is_trashed = FALSE') && row.is_trashed !== false && row.is_trashed !== undefined) return false;
      if (sql.includes('is_trashed = TRUE') && row.is_trashed !== true) return false;
      if (sql.includes('status = \'ACTIVE\'') && row.status !== 'ACTIVE') return false;

      return true;
    });

    // ORDER BY
    if (/ORDER BY\s+([a-zA-Z0-9_]+)\s*(DESC|ASC)?/i.test(sql)) {
      const match = /ORDER BY\s+([a-zA-Z0-9_]+)\s*(DESC|ASC)?/i.exec(sql);
      const col = match[1];
      const dir = (match[2] || 'ASC').toUpperCase();
      results.sort((a, b) => {
        if (a[col] < b[col]) return dir === 'ASC' ? -1 : 1;
        if (a[col] > b[col]) return dir === 'ASC' ? 1 : -1;
        return 0;
      });
    }

    return { rows: results, rowCount: results.length };
  }

  handleEmbeddedInsert(sql, params) {
    const store = this.embeddedStore;
    const tableMatch = sql.match(/INSERT INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    
    if (!tableMatch) {
      const simpleMatch = sql.match(/INSERT INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)/i);
      if (!simpleMatch) return { rows: [], rowCount: 0 };
      const tableName = simpleMatch[1].toLowerCase();
      const columns = simpleMatch[2].split(',').map(c => c.trim());
      if (!store[tableName]) store[tableName] = [];
      const newRecord = {};
      columns.forEach((col, idx) => {
        newRecord[col] = params[idx] !== undefined ? params[idx] : null;
      });
      if (!newRecord.id) newRecord.id = crypto.randomUUID();
      if (!newRecord.created_at) newRecord.created_at = new Date().toISOString();
      if (!newRecord.updated_at) newRecord.updated_at = new Date().toISOString();
      store[tableName].push(newRecord);
      this.saveEmbeddedStore();
      return { rows: [newRecord], rowCount: 1 };
    }

    const tableName = tableMatch[1].toLowerCase();
    const columns = tableMatch[2].split(',').map(c => c.trim());
    const valTokens = tableMatch[3].split(',').map(v => v.trim());

    if (!store[tableName]) store[tableName] = [];

    const newRecord = {};
    columns.forEach((col, idx) => {
      const token = valTokens[idx];
      if (!token) {
        newRecord[col] = params[idx] !== undefined ? params[idx] : null;
      } else if (token.startsWith('$')) {
        const paramIndex = parseInt(token.substring(1), 10) - 1;
        newRecord[col] = params[paramIndex] !== undefined ? params[paramIndex] : null;
      } else if (token === 'TRUE' || token === 'true') {
        newRecord[col] = true;
      } else if (token === 'FALSE' || token === 'false') {
        newRecord[col] = false;
      } else if (token === 'NULL' || token === 'null') {
        newRecord[col] = null;
      } else if (/^'([^']*)'$/.test(token)) {
        newRecord[col] = token.slice(1, -1);
      } else if (!isNaN(token)) {
        newRecord[col] = Number(token);
      } else {
        newRecord[col] = params[idx] !== undefined ? params[idx] : null;
      }
    });

    if (!newRecord.id) {
      newRecord.id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }
    if (!newRecord.created_at) {
      newRecord.created_at = new Date().toISOString();
    }
    if (!newRecord.updated_at) {
      newRecord.updated_at = new Date().toISOString();
    }

    store[tableName].push(newRecord);
    this.saveEmbeddedStore();

    return { rows: [newRecord], rowCount: 1 };
  }

  handleEmbeddedUpdate(sql, params) {
    const store = this.embeddedStore;
    const tableMatch = sql.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };

    const tableName = tableMatch[1].toLowerCase();
    const setClause = tableMatch[2];
    const whereClause = tableMatch[3];

    const records = store[tableName] || [];
    let updatedCount = 0;

    // Parse where clause for $N
    records.forEach(row => {
      let matchesWhere = true;

      // Extract conditions
      for (let i = 1; i <= params.length; i++) {
        const ph = `$${i}`;
        if (whereClause.includes(ph)) {
          const m = new RegExp(`([a-zA-Z0-9_]+)\\s*=\\s*\\${ph}`).exec(whereClause);
          if (m) {
            const col = m[1];
            if (row[col] != params[i - 1]) {
              matchesWhere = false;
            }
          }
        }
      }

      if (matchesWhere) {
        // Apply SET clause
        const setPairs = setClause.split(',');
        setPairs.forEach(pair => {
          // Check for arithmetic increment/decrement e.g. col = col + $1 or col = col - $1
          const mathMatch = pair.match(/([a-zA-Z0-9_]+)\s*=\s*([a-zA-Z0-9_]+)\s*(\+|\-)\s*\$([0-9]+)/);
          if (mathMatch) {
            const col = mathMatch[1];
            const op = mathMatch[3];
            const delta = BigInt(params[parseInt(mathMatch[4]) - 1] || 0);
            const current = BigInt(row[col] || 0);
            row[col] = op === '+' ? Number(current + delta) : Number(current - delta);
            return;
          }

          const m = pair.match(/([a-zA-Z0-9_]+)\s*=\s*(\$([0-9]+)|'([^']*)'|"([^"]*)"|([^\s,]+))/);
          if (m) {
            const col = m[1];
            const paramIdx = m[3] ? parseInt(m[3]) : null;
            if (paramIdx !== null) {
              row[col] = params[paramIdx - 1];
            } else if (m[4] !== undefined) {
              row[col] = m[4];
            } else if (m[5] !== undefined) {
              row[col] = m[5];
            } else if (m[2] === 'CURRENT_TIMESTAMP' || m[2] === 'NOW()') {
              row[col] = new Date().toISOString();
            } else if (m[6] === 'TRUE' || m[6] === 'true') {
              row[col] = true;
            } else if (m[6] === 'FALSE' || m[6] === 'false') {
              row[col] = false;
            } else if (!isNaN(Number(m[6]))) {
              row[col] = Number(m[6]);
            } else {
              row[col] = m[6];
            }
          }
        });
        row.updated_at = new Date().toISOString();
        updatedCount++;
      }
    });

    this.saveEmbeddedStore();
    return { rows: [], rowCount: updatedCount };
  }

  handleEmbeddedDelete(sql, params) {
    const store = this.embeddedStore;
    const tableMatch = sql.match(/DELETE FROM\s+([a-zA-Z0-9_]+)\s+WHERE\s+(.+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };

    const tableName = tableMatch[1].toLowerCase();
    const whereClause = tableMatch[2];

    const records = store[tableName] || [];
    const beforeCount = records.length;

    store[tableName] = records.filter(row => {
      for (let i = 1; i <= params.length; i++) {
        const ph = `$${i}`;
        if (whereClause.includes(ph)) {
          const m = new RegExp(`([a-zA-Z0-9_]+)\\s*=\\s*\\${ph}`).exec(whereClause);
          if (m) {
            const col = m[1];
            if (row[col] == params[i - 1]) {
              return false; // remove
            }
          }
        }
      }
      return true;
    });

    const deleted = beforeCount - store[tableName].length;
    this.saveEmbeddedStore();
    return { rows: [], rowCount: deleted };
  }
}

const db = new DatabaseManager();
export default db;
