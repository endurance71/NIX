# C3B disposable Auth/Storage stack — 2026-09-04

**Branch:** `codex/c3b-auth-storage`  
**Depends on:** PR #23 (merged). **Not** a production GO.

## Stack

Pinned images: Postgres `17.6.1.165`, GoTrue `v2.193.0`, storage-api `v1.65.1`, Kong `2.8.1`.  
Ports: `127.0.0.1:15532` (db), `127.0.0.1:15521` (kong). Prefix `c3b-authstore-*`.  

Bridge network with `enable_ip_masquerade=false` (defense in depth).  
**Primary isolation:** fail-closed NET_ADMIN sidecar attached with `--network container:<svc>` for each of `db` / `auth` / `storage` / `kong`. Applies iptables/ip6tables CIDR allow + OUTPUT DROP in the service netns, then probes public blocked + controlled internal allow from that same netns. Missing lock → BLOCKED before migrations (no `skipped` PASS).  
Helper image: local `c3b-alpine-iptables:3.20`.  
Cleanup: `performStackTeardown` (containers + network + volumes).

## Commands

| Command | Meaning |
| --- | --- |
| `test:c3b-budget-concurrency-validate` | includes authstore offline stubs |
| `test:c3b-auth-storage` | Path A live |
| `test:c3b-auth-storage-b` | Path B live (tip `20260831150000_…`) |

## Evidence

`~/.nix-ops/p0-3-c3b-audit-fixes/` SHA-tagged A/B logs + manifests (image digests).  
Everyday `supabase_db_NIX` untouched. Azure / flag / §6 / App Review **NO-GO**. 0 zł EAS.
