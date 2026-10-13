-- Schema do banco calculo_juros. Pode ser executado várias vezes sem erro.
-- Ordem: modalidades -> faixas_juros -> operacoes (por causa das chaves estrangeiras).

CREATE DATABASE IF NOT EXISTS calculo_juros
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE calculo_juros;

-- 1) modalidades: catálogo dos tipos de crédito (6 modalidades PF).
CREATE TABLE IF NOT EXISTS modalidades (
  codigo                   VARCHAR(40)      NOT NULL,
  nome                     VARCHAR(80)      NOT NULL,
  modalidade_bcb           VARCHAR(120)     NOT NULL,
  publico                  CHAR(2)          NOT NULL DEFAULT 'PF',
  regime_indexacao         VARCHAR(20)      NOT NULL DEFAULT 'PREFIXADO',
  teto_taxa_mes            DECIMAL(6,2)     NOT NULL,
  taxa_referencia_bcb_mes  DECIMAL(6,2)     NULL,
  prazo_min_meses          SMALLINT UNSIGNED NOT NULL,
  prazo_max_meses          SMALLINT UNSIGNED NOT NULL,
  descricao                VARCHAR(255)     NULL,
  ativo                    BOOLEAN          NOT NULL DEFAULT TRUE,
  criado_em                DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (codigo),
  CONSTRAINT ck_modalidades_prazo CHECK (prazo_min_meses > 1 AND prazo_max_meses >= prazo_min_meses),
  CONSTRAINT ck_modalidades_teto CHECK (teto_taxa_mes > 0)
);

-- 2) faixas_juros: para cada modalidade, a taxa de cada faixa de score.
CREATE TABLE IF NOT EXISTS faixas_juros (
  id                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  modalidade_codigo VARCHAR(40)      NOT NULL,
  faixa             CHAR(1)          NOT NULL,
  score_min         SMALLINT UNSIGNED NOT NULL,
  score_max         SMALLINT UNSIGNED NOT NULL,
  taxa_mes          DECIMAL(6,2)     NULL,
  taxa_ano          DECIMAL(6,2)     NULL,
  descricao         VARCHAR(80)      NULL,
  
  PRIMARY KEY (id),
  UNIQUE KEY uk_faixas_modalidade_faixa (modalidade_codigo, faixa),
  CONSTRAINT fk_faixas_modalidade FOREIGN KEY (modalidade_codigo) REFERENCES modalidades (codigo),
  CONSTRAINT ck_faixas_letra CHECK (faixa IN ('A', 'B', 'C', 'D', 'E')),
  CONSTRAINT ck_faixas_score CHECK (score_min <= score_max AND score_max <= 1000),
  CONSTRAINT ck_faixas_taxa CHECK ((faixa = 'E' AND taxa_mes IS NULL) OR (faixa <> 'E' AND taxa_mes IS NOT NULL))
);

-- 3) operacoes: cada operação simulada pela API (POST /api/operacoes).
--    Versão 2 (08/10/2026, D-06): cliente (tipo_pessoa + documento) e definição do sistema de
--    amortização (estado, sistema_definido, definido_em). Este CREATE só vale para banco novo:
--    em banco antigo o IF NOT EXISTS pula, e o db/schema.js avisa para rodar "npm run reset".
CREATE TABLE IF NOT EXISTS operacoes (
  id                      INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  identificador           VARCHAR(60)       NOT NULL,
  tipo_pessoa             CHAR(2)           NOT NULL,                      -- 'PF' | 'PJ'
  documento               VARCHAR(14)       NOT NULL,                      -- só dígitos: 11 (CPF) ou 14 (CNPJ)
  modalidade_codigo       VARCHAR(40)       NOT NULL,
  valor                   DECIMAL(15,2)     NOT NULL,
  score                   SMALLINT UNSIGNED NOT NULL,
  prazo_meses             SMALLINT UNSIGNED NOT NULL,
  data_liberacao          DATE              NOT NULL,
  primeiro_relacionamento BOOLEAN           NOT NULL DEFAULT FALSE,
  faixa_risco             CHAR(1)           NOT NULL,
  taxa_final_mes          DECIMAL(8,4)      NOT NULL,
  cet_price_ano           DECIMAL(8,2)      NOT NULL,
  cet_sac_ano             DECIMAL(8,2)      NOT NULL,
  resultado               JSON              NOT NULL,                      -- { cliente, entrada, taxa, simulacoes }; NUNCA recebe UPDATE
  estado                  VARCHAR(10)       NOT NULL DEFAULT 'SIMULADA',   -- 'SIMULADA' | 'DEFINIDA'
  sistema_definido        VARCHAR(5)        NULL,                          -- 'PRICE' | 'SAC' quando DEFINIDA
  definido_em             DATETIME          NULL,                          -- quando foi definida
  criado_em               DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_operacoes_identificador (identificador),
  KEY ix_operacoes_estado (estado),
  CONSTRAINT fk_operacoes_modalidade FOREIGN KEY (modalidade_codigo) REFERENCES modalidades (codigo),
  CONSTRAINT ck_operacoes_valor CHECK (valor > 0),
  CONSTRAINT ck_operacoes_score CHECK (score <= 1000),
  CONSTRAINT ck_operacoes_tipo_pessoa CHECK (tipo_pessoa IN ('PF', 'PJ')),
  CONSTRAINT ck_operacoes_documento CHECK (
    documento REGEXP '^[0-9]+$' AND (
      (tipo_pessoa = 'PF' AND CHAR_LENGTH(documento) = 11) OR
      (tipo_pessoa = 'PJ' AND CHAR_LENGTH(documento) = 14))),
  CONSTRAINT ck_operacoes_estado CHECK (estado IN ('SIMULADA', 'DEFINIDA')),
  CONSTRAINT ck_operacoes_definicao CHECK (
    (estado = 'SIMULADA' AND sistema_definido IS NULL AND definido_em IS NULL) OR
    (estado = 'DEFINIDA' AND sistema_definido IN ('PRICE', 'SAC') AND definido_em IS NOT NULL))
);
