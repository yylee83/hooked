#!/usr/bin/env python3
"""Turn a live export (scripts/export-live.sql) into a seed file for the test database.

Usage:  python3 scripts/make-test-seed.py ~/claude/hooked-backups/live-2026-11-02.json <test-folder>/supabase/seed.sql

Accounts keep their live ids but get no password (sign in on previews with an email link).
Notification triggers are paused while copying so no new notifications appear.
The seed file holds email addresses: keep it out of this repo.
"""
import json, secrets, sys

bundle_path, out_path = sys.argv[1], sys.argv[2]
b = json.load(open(bundle_path))
tag = "seed_" + secrets.token_hex(8)  # a dollar-quote tag that can't appear in the data
assert all(tag not in json.dumps(v) for v in b.values())
lit = lambda v: f"${tag}${json.dumps(v or [])}${tag}$::jsonb"

# Order matters: shows and episodes first, then the tables that point at them.
tables = ["shows", "episodes", "profiles", "logs", "hooked_shows", "list_items", "briefs", "follows",
          "recommendations", "comments", "reactions", "notifications", "allowed_emails", "trending_topics"]
paused = ["follows", "recommendations", "comments", "reactions"]
out = [
    "-- Test database seed: a copy of the live data. Generated; never commit it (it holds email addresses).",
    "begin;",
    f"""insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', coalesce(u.email_confirmed_at, now()),
  u.created_at, now(), '{{"provider":"email","providers":["email"]}}', '{{}}', '', '', '', '', '', '', '', ''
from jsonb_to_recordset({lit(b['users'])}) as u(id uuid, email text, created_at timestamptz, email_confirmed_at timestamptz);""",
    """insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', created_at, now() from auth.users;""",
    # Pause notification triggers, and the "fill in references" triggers (the copy already has them).
    *[f"alter table public.{t} disable trigger user;" for t in paused + ["logs", "list_items", "hooked_shows", "briefs", "notifications"]],
]
for t in tables:
    if b.get(t) is None and t in ("shows", "episodes"):
        continue  # an export from before shows/episodes existed
    cols = sorted({k for row in (b.get(t) or []) for k in row})
    if not cols:
        continue
    out.append(f"insert into public.{t} ({', '.join(cols)}) select {', '.join(cols)} from jsonb_populate_recordset(null::public.{t}, {lit(b[t])});")
out += [f"alter table public.{t} enable trigger user;" for t in paused + ["logs", "list_items", "hooked_shows", "briefs", "notifications"]]
out.append("select public.backfill_refs();  -- links anything the export didn't (e.g. an export from before stage A)")
out.append("commit;")
open(out_path, "w").write("\n".join(out) + "\n")
print(f"wrote {out_path}")
