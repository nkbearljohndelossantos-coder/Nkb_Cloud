-- =============================================================================
-- Migration 001: Initial Schema Baseline
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    avatar_url TEXT,
    role_id INT NOT NULL REFERENCES roles(id),
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    storage_quota_bytes BIGINT DEFAULT 107374182400,
    used_storage_bytes BIGINT DEFAULT 0,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS storage_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name VARCHAR(100) NOT NULL,
    machine_name VARCHAR(100) NOT NULL,
    os_version VARCHAR(150),
    ip_address VARCHAR(45),
    agent_token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'OFFLINE',
    version VARCHAR(30) DEFAULT '2.0.0',
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS storage_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES storage_agents(id) ON DELETE CASCADE,
    hardware_serial VARCHAR(150) NOT NULL,
    vendor VARCHAR(100),
    model VARCHAR(150),
    bus_type VARCHAR(50),
    media_type VARCHAR(50),
    total_capacity_bytes BIGINT NOT NULL,
    status VARCHAR(30) DEFAULT 'ONLINE',
    health_status VARCHAR(50) DEFAULT 'GOOD',
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (agent_id, hardware_serial)
);

CREATE TABLE IF NOT EXISTS storage_volumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES storage_devices(id) ON DELETE CASCADE,
    composite_identity VARCHAR(64) UNIQUE NOT NULL,
    volume_uuid VARCHAR(100) NOT NULL,
    hardware_serial VARCHAR(150) NOT NULL,
    partition_unique_id VARCHAR(150),
    label VARCHAR(100),
    assigned_name VARCHAR(100) NOT NULL,
    storage_purpose VARCHAR(50) DEFAULT 'GENERAL',
    filesystem VARCHAR(20) DEFAULT 'NTFS',
    current_drive_letter VARCHAR(10),
    mount_path VARCHAR(255) NOT NULL,
    total_bytes BIGINT NOT NULL,
    used_bytes BIGINT DEFAULT 0,
    free_bytes BIGINT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    priority INT DEFAULT 1,
    status VARCHAR(30) DEFAULT 'ONLINE',
    last_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    is_shared_drive BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    is_trashed BOOLEAN DEFAULT FALSE,
    preferred_volume_id UUID REFERENCES storage_volumes(id) ON DELETE SET NULL,
    color VARCHAR(20) DEFAULT '#0F172A',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(150) NOT NULL,
    extension VARCHAR(50),
    size_bytes BIGINT NOT NULL,
    category VARCHAR(50) DEFAULT 'OTHER',
    storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT,
    relative_path VARCHAR(1000) NOT NULL,
    current_version_num INT DEFAULT 1,
    status VARCHAR(50) DEFAULT 'AVAILABLE',
    is_starred BOOLEAN DEFAULT FALSE,
    is_trashed BOOLEAN DEFAULT FALSE,
    trashed_at TIMESTAMP WITH TIME ZONE,
    sha256_hash VARCHAR(64) NOT NULL,
    last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS file_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    version_num INT NOT NULL,
    storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT,
    relative_path VARCHAR(1000) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    change_summary VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (file_id, version_num)
);

CREATE TABLE IF NOT EXISTS file_checksums (
    id BIGSERIAL PRIMARY KEY,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    version_num INT NOT NULL,
    expected_sha256 VARCHAR(64) NOT NULL,
    actual_sha256 VARCHAR(64) NOT NULL,
    is_match BOOLEAN NOT NULL,
    checked_by_agent_id UUID REFERENCES storage_agents(id),
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id),
    file_name VARCHAR(255) NOT NULL,
    total_size_bytes BIGINT NOT NULL,
    total_chunks INT NOT NULL,
    uploaded_chunks INT DEFAULT 0,
    expected_sha256 VARCHAR(64),
    status VARCHAR(30) DEFAULT 'IN_PROGRESS',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

CREATE TABLE IF NOT EXISTS file_chunks (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    chunk_size_bytes INT NOT NULL,
    chunk_sha256 VARCHAR(64),
    is_verified BOOLEAN DEFAULT FALSE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (session_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS file_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    shared_with_department_id INT REFERENCES departments(id) ON DELETE CASCADE,
    share_token VARCHAR(128) UNIQUE,
    permission_level VARCHAR(20) NOT NULL DEFAULT 'VIEW',
    allow_download BOOLEAN DEFAULT TRUE,
    password_hash VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE,
    access_count INT DEFAULT 0,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS file_permissions (
    id SERIAL PRIMARY KEY,
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT TRUE,
    can_download BOOLEAN DEFAULT TRUE,
    can_edit BOOLEAN DEFAULT FALSE,
    can_delete BOOLEAN DEFAULT FALSE,
    can_share BOOLEAN DEFAULT FALSE,
    granted_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (file_id, user_id),
    UNIQUE (folder_id, user_id)
);

CREATE TABLE IF NOT EXISTS recycle_bin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type VARCHAR(20) NOT NULL,
    item_id UUID NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    original_parent_id UUID,
    deleted_by UUID NOT NULL REFERENCES users(id),
    original_size_bytes BIGINT DEFAULT 0,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    auto_delete_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

CREATE TABLE IF NOT EXISTS download_logs (
    id BIGSERIAL PRIMARY KEY,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    share_token VARCHAR(128),
    ip_address VARCHAR(45),
    user_agent TEXT,
    bytes_downloaded BIGINT,
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    data_type VARCHAR(30) DEFAULT 'STRING',
    category VARCHAR(50) DEFAULT 'GENERAL',
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
