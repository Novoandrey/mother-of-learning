"""
Parse open5e SRD-2014 creature data into MoL statblock format.

Output format is designed for the encounter tracker v2 right-panel:
- actions / bonus_actions / reactions / legendary_actions / passives
- each action has: name, desc, targeting (single/area/self), source (null for base)
- legendary_budget: int (default 3)
- saves/stats/skills/senses as flat objects
"""

import json
import re
import uuid
from pathlib import Path

DATA_DIR = Path(__file__).parent

# Which monsters we want for the first batch — diverse on purpose:
# simple melee, caster, legendary, reactions, regeneration, spell list.
TARGETS = [
    "srd_goblin",
    "srd_orc",
    "srd_giant-spider",
    "srd_troll",
    "srd_mage",
    "srd_medusa",
    "srd_young-red-dragon",
    "srd_adult-red-dragon",
    "srd_lich",
    "srd_vampire",
]


def cr_to_fraction(cr: str) -> str:
    """0.250 -> '1/4', 0.125 -> '1/8', 5.000 -> '5'."""
    try:
        f = float(cr)
    except (TypeError, ValueError):
        return cr or "0"
    if f == 0.125:
        return "1/8"
    if f == 0.25:
        return "1/4"
    if f == 0.5:
        return "1/2"
    if f.is_integer():
        return str(int(f))
    return cr


def detect_targeting(desc: str) -> str:
    """Very small heuristic: area vs single. Returns 'single' | 'area' | 'self'."""
    d = desc.lower()
    area_markers = [
        "each creature",
        "all creatures",
        "creatures within",
        "in a line",
        "-foot cone",
        "-foot radius",
        "-foot cube",
        "-foot sphere",
        "area",
    ]
    if any(m in d for m in area_markers):
        return "area"
    self_markers = ["the dragon regains", "regains hit points", "the troll regains"]
    if any(m in d for m in self_markers):
        return "self"
    return "single"


def build_stats(f: dict) -> dict:
    return {
        "str": f["ability_score_strength"],
        "dex": f["ability_score_dexterity"],
        "con": f["ability_score_constitution"],
        "int": f["ability_score_intelligence"],
        "wis": f["ability_score_wisdom"],
        "cha": f["ability_score_charisma"],
    }


def build_saves(f: dict) -> dict:
    saves = {}
    for ab in ("strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"):
        v = f.get(f"saving_throw_{ab}")
        if v is not None:
            saves[ab[:3]] = v
    return saves


def build_skills(f: dict) -> dict:
    skills = {}
    for k, v in f.items():
        if k.startswith("skill_bonus_") and v is not None:
            skills[k.replace("skill_bonus_", "")] = v
    return skills


def build_senses(f: dict) -> dict:
    s = {"passive_perception": f.get("passive_perception")}
    for key in ("darkvision_range", "blindsight_range", "tremorsense_range", "truesight_range"):
        v = f.get(key)
        if v:
            s[key.replace("_range", "")] = int(v)
    return s


def build_speed(f: dict) -> dict:
    speed = {}
    for k in ("walk", "fly", "swim", "climb", "burrow"):
        v = f.get(k)
        if v:
            speed[k] = int(v)
    if f.get("hover"):
        speed["hover"] = True
    return speed


def convert(creature_fields: dict, actions: list, traits: list) -> dict:
    f = creature_fields
    parent_key = f.get("_pk")  # injected below

    actions_out = []
    bonus_actions_out = []
    reactions_out = []
    legendary_out = []

    for a in actions:
        if a["fields"]["parent"] != parent_key:
            continue
        af = a["fields"]
        entry = {
            "name": af["name"],
            "desc": af["desc"],
            "targeting": detect_targeting(af["desc"]),
            "source": None,  # null = from statblock, otherwise item/effect id
        }
        at = af["action_type"]
        if at == "ACTION":
            actions_out.append(entry)
        elif at == "BONUS_ACTION":
            bonus_actions_out.append(entry)
        elif at == "REACTION":
            reactions_out.append(entry)
        elif at == "LEGENDARY_ACTION":
            entry["cost"] = af.get("legendary_cost") or 1
            legendary_out.append(entry)

    passives_out = []
    for t in traits:
        if t["fields"]["parent"] != parent_key:
            continue
        tf = t["fields"]
        desc = tf["desc"]
        d = desc.lower()
        entry = {
            "name": tf["name"],
            "desc": desc,
            "source": None,
        }

        # Promote bonus-action traits to bonus_actions.
        # Pattern: "as a bonus action", "as an action"+"bonus action",
        # "can take the X action as a bonus action"
        if re.search(r"\bas a bonus action\b", d):
            entry["targeting"] = detect_targeting(desc)
            bonus_actions_out.append(entry)
            continue

        # Promote reaction traits to reactions.
        # Pattern: "as a reaction", "using its reaction", "the X can use its reaction"
        # Also: triggered-when patterns without explicit "reaction" word but clearly
        # conditional ("When <X> is hit ...") — too risky to auto-promote, skip.
        if re.search(r"\b(as a reaction|its reaction|use a reaction)\b", d):
            entry["targeting"] = detect_targeting(desc)
            reactions_out.append(entry)
            continue

        # Promote action-in-trait to actions.
        # Pattern: "can use its action to" / "uses its action to" — these are
        # activated abilities hiding in the traits section.
        if re.search(r"\b(can use its action|uses its action|uses an action) to\b", d):
            entry["targeting"] = detect_targeting(desc)
            actions_out.append(entry)
            continue

        passives_out.append(entry)

    return {
        "name": f["name"],
        "source_doc": "SRD 2014 (Open5e)",
        "cr": cr_to_fraction(f["challenge_rating"]),
        "type": f["type"],
        "size": f["size"],
        "alignment": f.get("alignment", ""),
        "ac": f["armor_class"],
        "ac_detail": f.get("armor_detail") or "",
        "hp": f["hit_points"],
        "hit_dice": f.get("hit_dice", ""),
        "speed": build_speed(f),
        "stats": build_stats(f),
        "saves": build_saves(f),
        "skills": build_skills(f),
        "senses": build_senses(f),
        "languages": f.get("languages_desc", ""),
        "resistances": f.get("damage_resistances_display", ""),
        "immunities": f.get("damage_immunities_display", ""),
        "vulnerabilities": f.get("damage_vulnerabilities_display", ""),
        "condition_immunities": f.get("condition_immunities_display", ""),
        "proficiency_bonus": f.get("proficiency_bonus"),
        "actions": actions_out,
        "bonus_actions": bonus_actions_out,
        "reactions": reactions_out,
        "legendary_actions": legendary_out,
        "legendary_budget": 3 if legendary_out else 0,
        "passives": passives_out,
    }


def build_seed_sql(monsters: list) -> str:
    """Generate an idempotent SQL seed for the 10 SRD monsters.

    Uses ON CONFLICT (id) DO UPDATE so re-running the seed refreshes data
    without creating duplicates. IDs are deterministic UUID v5 derived from
    SRD slug, so the same monster always gets the same UUID.
    """
    # Namespace: one UUID for the whole SRD canon; monster UUIDs are v5 under it.
    SRD_NAMESPACE = uuid.UUID("a1b2c3d4-0000-0000-0000-000000000001")
    CAMPAIGN_ID = "00000000-0000-0000-0000-000000000001"  # Мать Учения
    CREATURE_TYPE_ID = "10000000-0000-0000-0000-000000000006"  # creature

    lines = [
        "-- Migration 019: Seed 10 SRD monsters with full statblocks",
        "-- Generated by parse_srd.py. Idempotent (ON CONFLICT).",
        "-- Tag: 'srd' + 'canon' for future campaign-overrides (IDEA-024).",
        "",
        "INSERT INTO nodes (id, campaign_id, type_id, title, fields) VALUES",
    ]

    rows = []
    for m in monsters:
        slug = "srd_" + m["name"].lower().replace(" ", "-")
        node_id = str(uuid.uuid5(SRD_NAMESPACE, slug))

        # Add canon tags
        fields = dict(m)
        fields["tags"] = ["srd", "canon", m["type"]]
        # Russian title: keep English for now, user can rename later
        title = m["name"]

        # Escape single quotes in JSON for SQL string literal
        fields_json = json.dumps(fields, ensure_ascii=False).replace("'", "''")

        row = (
            f"  ('{node_id}', '{CAMPAIGN_ID}', '{CREATURE_TYPE_ID}', "
            f"'{title}', '{fields_json}'::jsonb)"
        )
        rows.append(row)

    lines.append(",\n".join(rows))
    lines.append("ON CONFLICT (id) DO UPDATE SET")
    lines.append("  title = EXCLUDED.title,")
    lines.append("  fields = EXCLUDED.fields,")
    lines.append("  updated_at = now();")
    lines.append("")

    return "\n".join(lines)


def main():
    with open(DATA_DIR / "Creature.json") as f:
        creatures = json.load(f)
    with open(DATA_DIR / "CreatureAction.json") as f:
        actions = json.load(f)
    with open(DATA_DIR / "CreatureTrait.json") as f:
        traits = json.load(f)

    out = []
    for key in TARGETS:
        c = next((c for c in creatures if c["pk"] == key), None)
        if not c:
            print(f"WARN: {key} not found")
            continue
        fields = dict(c["fields"])
        fields["_pk"] = c["pk"]
        out.append(convert(fields, actions, traits))

    # JSON for eyeballing
    json_path = DATA_DIR / "monsters_out.json"
    with open(json_path, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    # SQL seed for applying to Supabase
    sql_path = DATA_DIR / "019_srd_monsters_seed.sql"
    with open(sql_path, "w") as f:
        f.write(build_seed_sql(out))

    print(f"Wrote {len(out)} monsters:")
    print(f"  JSON: {json_path}")
    print(f"  SQL : {sql_path}")
    print()
    for m in out:
        print(f"  {m['name']:30s} CR {m['cr']:4s}  "
              f"act={len(m['actions'])} bonus={len(m['bonus_actions'])} "
              f"react={len(m['reactions'])} leg={len(m['legendary_actions'])} "
              f"pass={len(m['passives'])}")


if __name__ == "__main__":
    main()
