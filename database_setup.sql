DROP DATABASE IF EXISTS bitcare_atend;
CREATE DATABASE bitcare_atend CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bitcare_atend;

-- ===========================
-- 1. Empresas
-- ===========================
CREATE TABLE companies (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18) UNIQUE,
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    url_webhook VARCHAR(255),
    api_key VARCHAR(255) UNIQUE NOT NULL,
    api_secret VARCHAR(255),
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_api_key (api_key),
    INDEX idx_cnpj (cnpj)
) ENGINE=InnoDB;

-- ============================================================
-- 3️⃣ Ajustes de tipos de data/hora (compatível MySQL)
-- ============================================================

-- appointments
ALTER TABLE appointments 
  MODIFY schedule_date_time TIMESTAMP NULL DEFAULT NULL,
  MODIFY executed_date_time TIMESTAMP NULL DEFAULT NULL;

-- files
ALTER TABLE files 
  MODIFY file_date TIMESTAMP NULL DEFAULT NULL;

-- protocols
ALTER TABLE protocols 
  MODIFY arrival_time TIMESTAMP NULL DEFAULT NULL,
  MODIFY start_attendance TIMESTAMP NULL DEFAULT NULL;

-- protocol_events
ALTER TABLE protocol_events 
  MODIFY timestamp TIMESTAMP NOT NULL;

-- protocol_history
ALTER TABLE protocol_history 
  MODIFY ts TIMESTAMP NOT NULL;

-- appointment_participants
ALTER TABLE appointment_participants 
  MODIFY start_date_time TIMESTAMP NULL DEFAULT NULL,
  MODIFY end_date_time TIMESTAMP NULL DEFAULT NULL;


-- ============================================================
-- 4️⃣ Constraints e índices únicos (idempotente e compatível MySQL)
-- ============================================================

-- Evitar arquivos duplicados por caminho
-- Para compatibilidade com versões antigas (limite 767 bytes de índice),
-- usamos uma coluna de hash do caminho com índice único.
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'files' AND column_name = 'file_path_hash'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE files ADD COLUMN file_path_hash CHAR(64) GENERATED ALWAYS AS (SHA2(file_path, 256)) STORED',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'files' AND index_name = 'uq_files_filepath'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX uq_files_filepath ON files (file_path_hash)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Evitar dois arquivos com o mesmo nome por appointment
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'files' AND column_name = 'name_original_hash'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE files ADD COLUMN name_original_hash CHAR(64) GENERATED ALWAYS AS (SHA2(name_original, 256)) STORED',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'files' AND index_name = 'uq_files_name_per_appt'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX uq_files_name_per_appt ON files (appointment_id, name_original_hash)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Índices de apoio para consultas (cria apenas se não existirem)

-- appointments (company_id, executed_date_time)
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'appointments' AND index_name = 'idx_appointments_company_executed'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_appointments_company_executed ON appointments (company_id, executed_date_time)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- files (company_id, file_date)
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'files' AND index_name = 'idx_files_company_date'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_files_company_date ON files (company_id, file_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- protocols (company_id)
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'protocols' AND index_name = 'idx_protocols_company'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_protocols_company ON protocols (company_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- protocol_events (company_id, timestamp)
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'protocol_events' AND index_name = 'idx_protocol_events_company_ts'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_protocol_events_company_ts ON protocol_events (company_id, timestamp)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- protocol_history (protocol_id, ts)
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'protocol_history' AND index_name = 'idx_protocol_history_protocol_ts'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_protocol_history_protocol_ts ON protocol_history (protocol_id, ts)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================
-- 5️⃣ Padronização final de timezone
-- ============================================================
-- Observação: CONVERT_TZ depende das tabelas de timezone carregadas no MySQL.
-- Veja a doc oficial caso necessário habilitar: mysql_tzinfo_to_sql.

UPDATE appointments SET 
  schedule_date_time = CONVERT_TZ(schedule_date_time, '-03:00', '+00:00'), 
  executed_date_time = CONVERT_TZ(executed_date_time, '-03:00', '+00:00'); 

UPDATE files SET 
  file_date = CONVERT_TZ(file_date, '-03:00', '+00:00'); 

UPDATE protocols SET 
  arrival_time = CONVERT_TZ(arrival_time, '-03:00', '+00:00'), 
  start_attendance = CONVERT_TZ(start_attendance, '-03:00', '+00:00'); 

UPDATE protocol_events SET 
  timestamp = CONVERT_TZ(timestamp, '-03:00', '+00:00'); 

UPDATE protocol_history SET 
  ts = CONVERT_TZ(ts, '-03:00', '+00:00'); 

UPDATE appointment_participants SET 
  start_date_time = CONVERT_TZ(start_date_time, '-03:00', '+00:00'), 
  end_date_time = CONVERT_TZ(end_date_time, '-03:00', '+00:00'); 

-- Índices adicionais para desempenho das consultas do backend
-- appointments: filtros frequentes por company_id e executed_date_time
ALTER TABLE appointments
  ADD INDEX idx_appointments_company_executed (company_id, executed_date_time);

-- appointment_participants: joins por (company_id, appointment_id) e filtro por role
ALTER TABLE appointment_participants
  ADD INDEX idx_ap_part_company_appointment (company_id, appointment_id),
  ADD INDEX idx_ap_part_role (role);

-- files: filtros por company_id e file_date
ALTER TABLE files
  ADD INDEX idx_files_company_date (company_id, file_date);

-- ===========================
-- 2. Usuários
-- ===========================
CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id INT UNSIGNED NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role ENUM('admin','user','viewer') DEFAULT 'user',
    is_active TINYINT(1) DEFAULT 1,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_company_id (company_id)
) ENGINE=InnoDB;

-- ===========================
-- 3. Sessões
-- ===========================
CREATE TABLE user_sessions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- ===========================
-- 4. Atendimentos
-- ===========================
CREATE TABLE appointments (
    id CHAR(36) NOT NULL,
    company_id INT UNSIGNED NOT NULL,
    status_appointment VARCHAR(10),
    appointment_specialty VARCHAR(100),
    schedule_date_time DATETIME,
    executed_date_time DATETIME,
    total_appointment_time INT,
    cid10_code VARCHAR(10),
    cid10_category VARCHAR(10),
    cid10_subcategory VARCHAR(10),
    cid10_value VARCHAR(255),
    detailed TINYINT(1),
    PRIMARY KEY (id),
    CONSTRAINT fk_appt_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===========================
-- 5. Detalhes de atendimento
-- ===========================
CREATE TABLE appointment_details (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    appointment_id CHAR(36) NOT NULL,
    company_id INT UNSIGNED NOT NULL,
    description TEXT,
    reason TEXT,
    orientation TEXT,
    notes TEXT,
    resume_total_time INT,
    CONSTRAINT fk_details_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_details_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===========================
-- 6. Participantes
-- ===========================
CREATE TABLE appointment_participants (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    appointment_id CHAR(36) NOT NULL,
    company_id INT UNSIGNED NOT NULL,
    cpf VARCHAR(11),
    role VARCHAR(10),
    start_date_time DATETIME,
    end_date_time DATETIME,
    council_type VARCHAR(10),
    council_number VARCHAR(20),
    council_region VARCHAR(5),
    name VARCHAR(100),
    CONSTRAINT fk_part_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_part_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===========================
-- 7. Arquivos
-- ===========================
CREATE TABLE files (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    appointment_id CHAR(36) NOT NULL,
    company_id INT UNSIGNED NOT NULL,
    file_date DATETIME,
    encoded TEXT,
    file_path TEXT,
    name_original VARCHAR(255),
    participant VARCHAR(100),
    CONSTRAINT fk_files_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_files_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===========================
-- 8. Empresa + admin padrão
-- ===========================
INSERT INTO companies (name, cnpj, email, api_key, api_secret)
VALUES ('EccoSalva', '00.000.000/0001-00', 'admin@eccosalva.com.br',
        'ECCO_API_KEY_123456', 'ECCO_SECRET_ABCDEF');

SET @eccosalva_id = LAST_INSERT_ID();

INSERT INTO users (company_id, username, email, password_hash, full_name, role)
VALUES (@eccosalva_id, 'admin', 'admin@eccosalva.com.br',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq5S/kS',
        'Administrador EccoSalva', 'admin');

INSERT INTO users (company_id, username, email, password_hash, full_name, role)
VALUES (@eccosalva_id, 'dashboard', 'dashboard@eccosalva.com.br',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq5S/kS',
        'Usuário Geral', 'viewer');

-- ===========================
-- 9. Eventos de protocolo (tempo real)
-- ===========================
CREATE TABLE IF NOT EXISTS protocol_events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id INT UNSIGNED NULL,
    company_key VARCHAR(100) NULL,
    company_name VARCHAR(255) NULL,
    protocol VARCHAR(255) NULL,
    appointment_id VARCHAR(255) NULL,
    participant_id VARCHAR(255) NULL,
    cpf VARCHAR(20) NULL,
    name VARCHAR(255) NULL,
    event VARCHAR(255) NULL,
    next_group VARCHAR(255) NULL,
    professional_id VARCHAR(255) NULL,
    professional_name VARCHAR(255) NULL,
    professional_license VARCHAR(255) NULL,
    timestamp DATETIME NOT NULL,
    payload JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_protocol_events_company_id_timestamp (company_id, timestamp),
    INDEX idx_protocol_events_company_key_timestamp (company_key, timestamp),
    INDEX idx_protocol_events_protocol (protocol),
    CONSTRAINT fk_protocol_events_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ===========================
-- 10. Cache de indicadores (dashboard)
-- ===========================
CREATE TABLE IF NOT EXISTS dashboard_data (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id INT UNSIGNED NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    counts_total INT DEFAULT 0,
    counts_medicas INT DEFAULT 0,
    counts_confirmacoes INT DEFAULT 0,
    day_of_week JSON NULL,
    hour_of_day JSON NULL,
    wait_times JSON NULL,
    service_times JSON NULL,
    top_doctors JSON NULL,
    top_specialties JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_dashboard_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_company_period (company_id, start_date, end_date),
    INDEX idx_dashboard_company_period (company_id, start_date, end_date)
) ENGINE=InnoDB;
