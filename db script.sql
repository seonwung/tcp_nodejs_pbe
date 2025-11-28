-- 데이터베이스가 없으면 생성하고, 문자 인코딩을 utf8mb4로 설정
CREATE DATABASE IF NOT EXISTS rps_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- rps_db 데이터베이스를 사용하도록 설정
USE rps_db;

-- =========================================================================
-- users 테이블 생성 (회원 정보)
-- =========================================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    nickname VARCHAR(64) UNIQUE NULL,
    mmr INT NOT NULL DEFAULT 1000,
    win INT DEFAULT 0,
    lose INT DEFAULT 0,
    draw INT DEFAULT 0,
    last_played DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================================
-- tiers 테이블 생성 및 데이터 삽입 (랭크/티어 정보)    
-- =========================================================================
CREATE TABLE tiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,  -- 티어이름들(브론즈, 실버, 골드 등등)
    min_rating INT NOT NULL,    -- 이티어의 최소점수
    max_rating INT NULL,        -- 마지막 티어는 "NULL"로두고 "이상"으로 처리 가능
    image_path VARCHAR(255) NOT NULL
);

INSERT INTO tiers (name, min_rating, max_rating, image_path) VALUES
('BRONZE', 0, 999, '/img/tier/bronze.jpg'),
('SILVER', 1000, 1999, '/img/tier/silver.jpg'),
('GOLD', 2000, 2999, '/img/tier/gold.jpg'),
('PLATINUM', 3000, 3999, '/img/tier/platinum.jpg'),
('DIAMOND', 4000, 4999, '/img/tier/diamond.jpg'),
('MASTER', 5000, NULL, '/img/tier/master.jpg'); -- max_rating 5000 이상

-- =========================================================================
-- rating_rules 테이블 생성 및 데이터 삽입 
-- =========================================================================
CREATE TABLE rating_rules (
    id TINYINT PRIMARY KEY,
    win_points INT NOT NULL,            -- 승리 시 +점수
    lose_points INT NOT NULL,           -- 패배 시 -점수
    draw_points INT NOT NULL DEFAULT 0, -- 무승부 있을 경우 대비
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
        ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO rating_rules (id, win_points, lose_points, draw_points) 
VALUES (1, 100, -50, 0);
