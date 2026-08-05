-- Phase 2C: GenX Model Registry
-- Migration: 013_genx_model_registry.sql

-- GenX Models (live catalogue from GenX API)
CREATE TABLE IF NOT EXISTS genx_models (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    vendor VARCHAR(255),
    inputs JSONB DEFAULT '[]', -- ['text', 'image', 'video', 'audio']
    outputs JSONB DEFAULT '[]', -- ['text', 'image', 'video', 'audio', 'embedding']
    operations JSONB DEFAULT '[]', -- ['chat', 'vision', 'text_to_image', etc.]
    endpoint VARCHAR(500),
    asynchronous BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'available', -- 'available', 'unavailable', 'deprecated'
    context_length INTEGER,
    raw_metadata JSONB DEFAULT '{}',
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_verified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GenX Model Sync Runs
CREATE TABLE IF NOT EXISTS genx_model_sync_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    total_models INTEGER DEFAULT 0,
    new_models INTEGER DEFAULT 0,
    updated_models INTEGER DEFAULT 0,
    removed_models INTEGER DEFAULT 0,
    errors JSONB DEFAULT '[]',
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_genx_models_status ON genx_models(status);
CREATE INDEX IF NOT EXISTS idx_genx_models_vendor ON genx_models(vendor);
CREATE INDEX IF NOT EXISTS idx_genx_models_operations ON genx_models USING GIN(operations);
