-- Migration: 011_node_content
-- Feature: Markdown wiki-content on node cards (IDEA-006)

-- Add content column for markdown wiki-pages
ALTER TABLE nodes ADD COLUMN content text NOT NULL DEFAULT '';

-- Update search vector trigger to include content
CREATE OR REPLACE FUNCTION update_node_search_vector()
RETURNS trigger AS $$
BEGIN
  new.search_vector := to_tsvector('russian',
    coalesce(new.title, '') || ' ' ||
    coalesce(new.fields->>'description', '') || ' ' ||
    coalesce(new.fields->>'status', '') || ' ' ||
    coalesce(new.fields->>'player', '') || ' ' ||
    coalesce(new.content, '')
  );
  new.updated_at := now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Rebuild search vectors for existing rows
UPDATE nodes SET updated_at = now();
