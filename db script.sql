-- ============================================================
-- RPS 게임용 DB 초기 세팅 스크립트 (EC2용)
-- ============================================================

-- 1) DB 생성 및 선택
CREATE DATABASE IF NOT EXISTS rps_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE rps_db;

-- ------------------------------------------------------------
-- 2) 레이팅 규칙 테이블
--    - 승/패/무 시 MMR(또는 점수) 변동 규칙 저장
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rating_rules (
  id          TINYINT      NOT NULL,                      -- 규칙 ID (1개만 쓸 거면 1 고정)
  win_points  INT          NOT NULL,                      -- 승리 시 포인트
  lose_points INT          NOT NULL,                      -- 패배 시 포인트
  draw_points INT          NOT NULL DEFAULT 0,            -- 무승부 시 포인트
  updated_at  TIMESTAMP    NULL
              DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3) 사용자 테이블
--    - 로그인 계정, 권한, MMR, 닉네임 관리
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT          NOT NULL AUTO_INCREMENT,
  username      VARCHAR(30)  NOT NULL,                    -- 로그인 ID
  password_hash VARCHAR(255) NOT NULL,                    -- 비밀번호 해시(bcrypt)
  rating        INT          NOT NULL DEFAULT 1000,       -- 일반 레이팅(필요 시 사용)
  role          ENUM('user', 'admin')
                NOT NULL DEFAULT 'user',                  -- 권한
  mmr           INT          NOT NULL DEFAULT 1000,       -- 매칭용 MMR
  created_at    DATETIME     NOT NULL
                DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL
                DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
  nickname      VARCHAR(30)  NOT NULL DEFAULT 'Guest',    -- 게임에서 표시할 닉네임
  PRIMARY KEY (id),
  UNIQUE KEY username (username)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4) 티어 테이블
--    - 브론즈, 실버, 골드 같은 티어 범위 정의
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tiers (
  id         INT          NOT NULL AUTO_INCREMENT,
  name       VARCHAR(50)  NOT NULL,                       -- 티어 이름 (Bronze, Silver ...)
  min_rating INT          NOT NULL,                       -- 이 점수 이상
  max_rating INT          NULL DEFAULT NULL,              -- 이 점수 미만 (최상위는 NULL)
  image_path VARCHAR(255) NOT NULL,                       -- 티어 이미지 경로
  PRIMARY KEY (id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

INSERT INTO tiers (name, min_rating, max_rating, image_path) VALUES
('BRONZE',   0,    999,  '/img/tier/bronze.png'),
('SILVER',   1000, 1999, '/img/tier/silver.png'),
('GOLD',     2000, 2999, '/img/tier/gold.png'),
('PLATINUM', 3000, 3999, '/img/tier/platinum.png'),
('DIAMOND',  4000, 4999, '/img/tier/diamond.png'),
('MASTER',   5000, NULL, '/img/tier/master.png');  -- max_rating NULL = 5000 이상

INSERT INTO rating_rules (id, win_points, lose_points, draw_points)
VALUES (1, 100, -50, 0);
