-- Migration: 0005_recommendation_notebook_url.sql

ALTER TABLE recommendations ADD COLUMN notebook_url TEXT;
