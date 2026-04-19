# Scripts

One-off data scripts. Not part of the Next.js build.

## parse_srd.py

Parses open5e SRD-2014 creature data into MoL statblock format.
Generates `019_srd_monsters_seed.sql` (next to the other migrations) with
10 canonical SRD monsters: Goblin, Orc, Giant Spider, Troll, Mage, Medusa,
Young Red Dragon, Adult Red Dragon, Lich, Vampire.

### Usage

```bash
# 1. Clone open5e-api for source data (one-time)
cd /tmp && git clone --depth 1 https://github.com/open5e/open5e-api.git

# 2. Copy SRD JSON files next to the script
cp /tmp/open5e-api/data/v2/wizards-of-the-coast/srd-2014/{Creature,CreatureAction,CreatureTrait}.json \
   mat-ucheniya/scripts/

# 3. Run
cd mat-ucheniya/scripts && python3 parse_srd.py

# 4. Apply the generated seed
# (paste mat-ucheniya/supabase/migrations/019_srd_monsters_seed.sql
#  into Supabase SQL Editor, or use `supabase db push`)
```

### How classification works

- `CreatureAction.action_type` maps directly: ACTION → actions,
  BONUS_ACTION → bonus_actions, REACTION → reactions,
  LEGENDARY_ACTION → legendary_actions (with `cost` from `legendary_cost`).
- Traits with "as a bonus action" in desc → bonus_actions.
- Traits with "as a reaction" / "its reaction" → reactions.
- Traits with "can use its action to" → actions.
- Everything else stays in passives.
- Targeting heuristic: "each creature" / "cone" / "radius" → area,
  "one target" / "one creature" → single.

### UUID stability

Monster IDs are `uuid5(SRD_NAMESPACE, srd_slug)`, so re-running the script
and re-applying the seed updates the same rows instead of creating duplicates.
The seed uses `ON CONFLICT (id) DO UPDATE` for idempotency.

### Adding more monsters

Edit the `TARGETS` list in `parse_srd.py`. Slugs come from open5e-api `pk`
field (e.g. `srd_beholder`, `srd_mind-flayer`).
