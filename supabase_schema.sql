-- Call Audit PostgreSQL Database Schema
-- Run this in your Supabase SQL Editor

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Drop existing tables if they exist
DROP TABLE IF EXISTS public.audits CASCADE;
DROP TABLE IF EXISTS public.calls CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- 3. Create Users Table
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Calls Table
CREATE TABLE public.calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id TEXT UNIQUE NOT NULL,
    agent_name TEXT NOT NULL,
    agent_email TEXT,
    customer_name TEXT,
    process TEXT DEFAULT 'General',
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    phone_number TEXT,
    duration TEXT DEFAULT '00:00',
    talktime TEXT DEFAULT '',
    dispose TEXT DEFAULT '',
    second_dispose TEXT DEFAULT '',
    remarks TEXT,
    audio_url TEXT DEFAULT '',
    audio_filename TEXT,
    uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'audited')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Audits Table
CREATE TABLE public.audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
    auditor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    scores JSONB NOT NULL, -- greetingQuality, communicationClarity, complianceAdherence, resolutionQuality, customerSatisfaction
    remarks TEXT,
    overall_score NUMERIC(3,2),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Create Indexes for Performance
CREATE INDEX idx_calls_date ON public.calls(date DESC);
CREATE INDEX idx_calls_status ON public.calls(status);
CREATE INDEX idx_calls_agent_name ON public.calls(agent_name);
CREATE INDEX idx_calls_is_active ON public.calls(is_active);
CREATE INDEX idx_audits_call_id ON public.audits(call_id);
CREATE INDEX idx_audits_auditor_id ON public.audits(auditor_id);

-- 7. Seed Default Users
INSERT INTO public.users (username, email, password, role, is_active)
VALUES 
('superadmin', 'kabirhaldar4444@gmail.com', '$2a$10$9dJFxRcUwoGbw1aFIPIj8.mhXdiX/mkrYuMyBYlB8TsvHnND8UFQu', 'superadmin', true),
('admin', 'admin@callaudit.com', '$2a$10$MB0QxL9Q3HYQMzbojaHoheLS/RFS0sOox0yX68Inr9I1G7Zzs4w7a', 'admin', true)
ON CONFLICT (username) DO NOTHING;

-- 8. Disable Row Level Security (RLS) for direct admin backend queries
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits DISABLE ROW LEVEL SECURITY;

