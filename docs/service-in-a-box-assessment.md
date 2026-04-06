# DataAnalyzer — Service in a Box: Hardware & OS Assessment

*Target market: SME (Small-to-Medium Enterprise)*

---

## Recommended Spec

### Form Factor

A **mini PC** hits the right balance of cost, noise, power draw, and reliability for SME deployments. No rack hardware needed.

| Component | Recommendation | Notes |
|-----------|---------------|-------|
| **CPU** | AMD Ryzen 7 / Intel Core i7 (12th gen+), 8 cores | Handles n8n + Postgres concurrency |
| **RAM** | 32 GB DDR4/DDR5 | n8n is the memory hog; 16 GB is tight under AI-heavy workloads |
| **Storage** | 1 TB NVMe SSD | Fast I/O matters for Postgres; add 2nd drive for backups |
| **Network** | Dual 2.5 GbE | One for LAN, one optional for management/WAN |
| **GPU** | None needed | All AI inference calls go out to external APIs |
| **Form factor** | Fanless or near-silent mini PC | Suitable for office environments |

**Target price: $400–700 USD** for the unit.

### Suggested Models

| Model | CPU | Notes |
|-------|-----|-------|
| **Beelink SER7** | Ryzen 7840HS | Good value, passive-cooled option available |
| **GEEKOM IT13** | Core i9-13900H | Strong single-thread for n8n JS execution |
| **Intel NUC 13 Pro** | Core i7-1360P | Enterprise pedigree, better longevity/support story |

### OS: Ubuntu Server 24.04 LTS

Clear winner for the Docker-based stack (n8n, PocketBase, PostgreSQL, Nginx):

- Docker documentation overwhelmingly targets Ubuntu
- 5-year LTS support — no OS churn for clients
- Headless (no desktop), minimal attack surface
- `unattended-upgrades` for hands-off security patching
- Any sysadmin can manage it if needed

**Runner-up:** Debian 12 — leaner, equally stable, slightly less Docker ecosystem coverage.
**Avoid:** Windows Server — licensing cost, heavier RAM overhead, Docker on Windows is messier.

---

## Mac Mini Consideration

The M4 Mac Mini ($599 USD) is attractive hardware — silent, tiny, efficient — but has meaningful drawbacks as a production appliance.

### Problems for This Use Case

**Docker runs in a Linux VM on macOS**
- Docker Desktop uses a hidden Linux VM (Apple Hypervisor) — extra RAM overhead (~2–3 GB), slower filesystem I/O
- Docker Desktop requires a commercial license for business use ($21/user/month or $84/year)

**macOS is not a true server OS**
- Periodic GUI interaction needed for updates and security prompts
- macOS updates can break Docker Desktop without warning
- Sleep/wake must be manually disabled

**Repairability & Longevity**
- Soldered RAM and SSD — not field-repairable
- No spare parts ecosystem for SME self-service
- No local Apple service in many non-urban areas

### Mac Mini Verdict

| Scenario | Verdict |
|----------|---------|
| Client already in Apple ecosystem | Worth considering |
| Demo / proof-of-concept | Great for optics |
| Long-term production appliance | Riskier than Linux mini PC |

### Comparison Summary

| | Mac Mini M4 | Mini PC + Ubuntu |
|--|-------------|-----------------|
| Docker | VM overhead, paid license | Native, free |
| Headless ops | Awkward | Natural |
| Price | $599+ | $400–600 |
| Repairability | Poor (soldered) | Good (standard parts) |
| SME support story | Needs Apple nearby | Any IT person can manage |
| Performance | Excellent | Very good |
| "Looks professional" | ✓ | Neutral |

**Bottom line:** Mac Mini is a better demo machine than a production appliance for SME. Best suited to fully managed deployments where you handle all support remotely.

---

## Additional Packaging Considerations

| Item | Recommendation |
|------|---------------|
| **Remote access** | Bundle WireGuard VPN — remote support without exposing n8n/PocketBase to internet |
| **UPS** | Recommend a small UPS to clients — protects Postgres data integrity on power loss |
| **Backups** | Script nightly `pg_dump` to USB drive or cloud bucket — SME clients won't do this themselves |
| **SSL** | Let's Encrypt via Nginx (already in stack) or `mkcert` for local trusted certs |
| **Monitoring** | Lightweight uptime endpoint or Netdata for visibility |
| **First-boot setup** | Single `./install.sh` that pulls Docker images, seeds the DB, and starts services |
