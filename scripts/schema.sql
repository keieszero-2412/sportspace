-- Run this in Supabase SQL Editor

-- Users table
CREATE TABLE IF NOT EXISTS public."Users" (
    id text PRIMARY KEY,
    name text,
    email text,
    phone text,
    role text,
    "credibilityScore" numeric,
    "createdAt" timestamp with time zone,
    raw_data jsonb
);

-- Facilities table
CREATE TABLE IF NOT EXISTS public."Facilities" (
    id text PRIMARY KEY,
    name text,
    address text,
    province text,
    sport text,
    image text,
    lng numeric,
    lat numeric,
    phone text,
    "phone_status" text,
    "price_summary" text,
    "scale_courts" text,
    "operating_hours" jsonb,
    amenities jsonb,
    "source_url" text,
    raw_data jsonb
);

-- Courts table
CREATE TABLE IF NOT EXISTS public."Courts" (
    id text PRIMARY KEY,
    "facility_id" text,
    name text,
    "sport_type" text,
    "surface_type" text,
    "is_indoor" boolean,
    "is_available" boolean,
    "basePrice" numeric,
    "price_day" numeric,
    "price_night" numeric,
    "price_weekend" numeric,
    raw_data jsonb
);

-- Availability table
CREATE TABLE IF NOT EXISTS public."Availability" (
    id text PRIMARY KEY,
    "court_id" text,
    date text,
    "start_time" text,
    "end_time" text,
    status text,
    price numeric,
    "slot_id" text,
    "booking_id" text,
    raw_data jsonb
);

-- Matches table
CREATE TABLE IF NOT EXISTS public."Matches" (
    id text PRIMARY KEY,
    raw_data jsonb
);

-- PricingRules table
CREATE TABLE IF NOT EXISTS public."PricingRules" (
    id text PRIMARY KEY,
    "court_id" text,
    "facility_id" text,
    raw_data jsonb
);

-- Notifications table used by the authenticated in-app notification panel.
CREATE TABLE IF NOT EXISTS public."Notifications" (
    id text PRIMARY KEY,
    "userId" text NOT NULL,
    message text,
    "messageEn" text,
    read boolean NOT NULL DEFAULT false,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
    raw_data jsonb
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
    ON public."Notifications" ("userId", "createdAt" DESC);

-- Enable RLS (Optional, can be configured later)
-- ALTER TABLE public."Users" ENABLE ROW LEVEL SECURITY;
