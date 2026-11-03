#!/usr/bin/env python3
"""Offline SQLite migration + critical concurrency predicate smoke tests."""
import sqlite3,glob,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
con=sqlite3.connect(':memory:')
for f in sorted(glob.glob(str(root/'drizzle'/'*.sql'))):
 con.executescript(pathlib.Path(f).read_text().replace('--> statement-breakpoint',''))
season='2026-11-02';owner='guest:smoke';sid='smoke-session';cost=12
con.execute('INSERT INTO arena_v7_wallets(owner,season_key,credits_remaining,created_at) VALUES(?,?,?,?)',(owner,season,100,'now'))
con.execute("INSERT INTO arena_v7_sessions(id,owner,season_key,episode_id,snapshot_json,commitment,status,created_at) VALUES(?,?,?,?,?,?,?,?)",(sid,owner,season,'aftershock','{}','x','open','now'))
def dispatch(jid):
 con.execute('''INSERT INTO arena_v7_jobs(id,owner,session_id,specialist,cost,report_json,created_at)
 SELECT ?,?,?,?,?,?,? FROM arena_v7_wallets w WHERE w.owner=? AND w.season_key=? AND w.credits_remaining>=?
 AND EXISTS(SELECT 1 FROM arena_v7_sessions s WHERE s.id=? AND s.owner=? AND s.status='open')
 AND NOT EXISTS(SELECT 1 FROM arena_v7_jobs j WHERE j.session_id=? AND j.specialist=?)''',(jid,owner,sid,'flow',cost,'{}','now',owner,season,cost,sid,owner,sid,'flow'))
 con.execute('UPDATE arena_v7_wallets SET credits_remaining=credits_remaining-? WHERE owner=? AND season_key=? AND EXISTS(SELECT 1 FROM arena_v7_jobs WHERE id=?)',(cost,owner,season,jid))
dispatch('a');dispatch('b')
assert con.execute('SELECT credits_remaining FROM arena_v7_wallets').fetchone()[0]==88
assert con.execute('SELECT COUNT(*) FROM arena_v7_jobs').fetchone()[0]==1
r1=con.execute("UPDATE arena_v7_sessions SET status='resolved' WHERE id=? AND owner=? AND status='open'",(sid,owner)).rowcount
r2=con.execute("UPDATE arena_v7_sessions SET status='resolved' WHERE id=? AND owner=? AND status='open'",(sid,owner)).rowcount
assert (r1,r2)==(1,0)
print('PASS: 0000–0004 schema, unique research debit, one-time settlement')
