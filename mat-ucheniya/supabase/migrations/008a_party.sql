-- 008a_party.sql
-- Feature: "Current Party" — persistent PC group that lives across encounters

CREATE TABLE party (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE party_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  node_id uuid REFERENCES nodes(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  max_hp int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_party_members_party ON party_members(party_id);

-- Auto-create a party row for each existing campaign
INSERT INTO party (campaign_id)
SELECT id FROM campaigns
ON CONFLICT (campaign_id) DO NOTHING;
