-- Bootstrap extensions required by later migrations.
-- This file sorts before 001_initial.sql so VECTOR columns are valid by migration 003.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;
