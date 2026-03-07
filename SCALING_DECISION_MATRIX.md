# Scaling Decision Matrix: Choosing the Right Path

Reference guide for making upgrade decisions based on concrete metrics.

---

## Quick Decision Tree

```
                    Current Players
                          |
                +---------+---------+
                |         |         |
              <50       50-300    300+
                |         |         |
                ✓         ?         ✗
               Stay     Vertical    Need
              Current   Scale     Horizontal
```

---

## Player Count vs. Infrastructure

### Tier 1: Party Scale (1–50 concurrent players)

**Characteristics**:
- Single game room per venue
- 10–30 minutes duration
- Peak: ~100 total connections/day
- 1–3 simultaneous rooms

**Current Setup**: ✅ **PERFECT**
- Single Docker container
- In-memory state
- JSON file persistence
- Headscale VPN networking

**Decision**: **Do nothing** until player count grows

**Metrics to watch**:
```bash
# Monitor memory usage
docker stats quiz-trivia-quiz-1

# Reasonable thresholds:
# Memory: <300 MB (current typical: <100 MB)
# CPU: <10% idle time
```

**Cost**: $0 (already deployed)
**Uptime SLA**: None needed (local party game)

---

### Tier 2: Regional Scale (50–300 concurrent players)

**Characteristics**:
- Multiple simultaneous game rooms
- 50–100 connections/hour
- Peak: 20–30 simultaneous connections
- Multi-venue rollout (3–5 locations)

**Decision Matrix**:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Memory usage | >500 MB | Upgrade Docker memory limit |
| CPU peak | >20% | Increase instance resources OR vertical scale |
| WebSocket lag | >500 ms | May need scaling (check rate limiting first) |
| Room count | >5 simultaneous | Consider vertical scale |
| Daily games | >50 games/day | Add SQLite for analytics (optional) |

**Recommended Actions** (in order):

1. **Vertical Scale** (cheaper, less complex):
   ```bash
   # Update docker-compose.yml
   services:
     quiz:
       mem_limit: 2g  # Increase from unlimited
       cpus: '1.0'    # Limit to 1 CPU core max
   ```
   - Cost: +$20–50/mo (more powerful VM)
   - Supports: 50–300 concurrent
   - Timeline: 1–2 hours
   - Risk: Low

2. **Monitor metrics**:
   ```bash
   # Install monitoring (optional)
   docker run -d \
     -p 9090:9090 \
     -v prometheus.yml:/etc/prometheus/prometheus.yml \
     prom/prometheus
   ```

3. **Optional: Add SQLite** for leaderboards (6–8 hours)

**Do NOT do** (yet):
- Horizontal scaling (unnecessary overhead)
- Kubernetes (massive over-engineering)
- PostgreSQL (overkill for regional scale)

**Cost**: $20–100/mo (mostly on infrastructure)
**Uptime SLA**: Best effort (local party game)

---

### Tier 3: Multi-Regional / Growing (300–1,000 concurrent players)

**Characteristics**:
- 15–20 simultaneous rooms
- 200–500 connections/hour peak
- Multiple cities/venues
- Need for analytics and retention

**Decision Matrix**:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Single instance CPU | >60% at peak | Horizontal scale required |
| Memory | >1.5 GB | Horizontal scale required |
| Connection time | >2 seconds | Load balancer needed |
| Room handoff failures | >0.1% | Cross-instance state sharing (Redis) |
| Data retention need | 30+ days | SQLite or PostgreSQL |

**Recommended Actions** (in order):

1. **Implement Horizontal Scaling**:
   - Load balancer: Nginx (free, 2–3 hours)
   - Redis pub/sub: ~$50/mo or self-hosted
   - 3–5 instances: +$60–200/mo
   - Timeline: 6–9 hours
   - Risk: Medium (complex, needs testing)

2. **Add persistent storage**:
   - SQLite (local): 6–8 hours, $0
   - PostgreSQL (managed): 8–12 hours, $50–300/mo

3. **Implement monitoring**:
   - Prometheus + Grafana: 4–6 hours
   - Data retention: 7–30 days

4. **Database optimization**:
   - Index frequently queried columns
   - Archive old game records

**Do NOT do** (yet):
- Kubernetes (wait for 1,000+ concurrent)
- Sharding across regions (over-engineered)
- Caching layer (CDN overkill for real-time game)

**Cost**: $150–500/mo
**Uptime SLA**: 95–99% (multiple regions, redundancy)
**Timeline to implement**: Q1–Q2 2027

---

### Tier 4: Enterprise Scale (1,000+ concurrent players)

**Characteristics**:
- 50+ simultaneous rooms
- 2,000+ connections/hour
- Multi-region, multi-country
- SLA: 99.9% uptime required
- Data compliance: GDPR, backup requirements

**Decision Matrix**:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Total RPS | >1,000 | Use Kubernetes or Fastify |
| Instance count | >10 | Kubernetes required |
| Latency p99 | >1 second | Load balancer geo-distribution needed |
| Data size | >10 GB | PostgreSQL + replication |
| Disaster recovery | RTO >1 hour | Multi-region active-active |

**Recommended Actions** (in order):

1. **Migrate to Kubernetes** (20–40 hours):
   - EKS (AWS), GKE (GCP), or AKS (Azure)
   - Auto-scaling: HorizontalPodAutoscaler
   - Cost: $200–1,000/mo

2. **Use managed PostgreSQL**:
   - AWS RDS: $50–500/mo
   - Replication across regions
   - Automated backups

3. **Implement CDN + caching**:
   - Cloudflare Workers for static assets
   - Redis Cluster for session state
   - Cost: $100–500/mo

4. **Advanced monitoring**:
   - Datadog, New Relic, or ELK stack
   - Error tracking, performance monitoring
   - Cost: $500–2,000/mo

5. **Multi-region deployment**:
   - Active-active across 3+ regions
   - Database replication
   - Geo-routing (Route 53, Azure Traffic Manager)

**Cost**: $1,500–5,000/mo
**Uptime SLA**: 99.95%–99.99%
**Timeline to implement**: Q3–Q4 2027

---

## Cost Comparison Table

### Total Cost of Ownership (12 months)

| Scale | Instance | Storage | LB/Network | Monitoring | Total |
|-------|----------|---------|------------|-----------|-------|
| **Tier 1** (1–50) | $0–20/mo | $5/mo | $0 | $0 | **$60–240/yr** |
| **Tier 2** (50–300) | $40–80/mo | $10/mo | $0 | $10/mo | **$600–1,200/yr** |
| **Tier 3** (300–1K) | $100–200/mo | $50/mo | $30/mo | $50/mo | **$2,000–4,000/yr** |
| **Tier 4** (1K+) | $300–800/mo | $200/mo | $100/mo | $500/mo | **$12,000–130,000/yr** |

*Costs assume cloud infrastructure (AWS, GCP, etc.); self-hosted reduces by 30–50% but adds labor.*

---

## Technology Stack by Tier

### Tier 1 (Current)
```
┌─────────────────┐
│  Browser/Phone  │
│   (WebSocket)   │
└────────┬────────┘
         │
    Headscale
         │
    ┌────▼─────┐
    │   Node.js │
    │ + Express │
    │    + ws   │
    └────┬─────┘
         │
    JSON files
    (questions-db.json)
```

**Tools**:
- Express.js v4.18.2
- ws v8.19.0
- Node.js v22
- Docker Alpine
- Local JSON persistence

### Tier 2 (Vertical Scaling)
```
┌────────────────┐
│ Browser/Phone  │
│  (WebSocket)   │
└────────┬───────┘
         │
    Headscale VPN
         │
    ┌────▼─────────┐
    │   Node.js     │
    │  (2GB RAM,    │
    │   2 CPU)      │
    │ + Express     │
    │ + ws          │
    └────┬────────┘
         │
    ┌────▴────┐
    │          │
  JSON     SQLite
 (cache)  (optional
           leaderboard)
```

**Additional tools**:
- Optional: SQLite3 (Node built-in)
- Docker: Memory limit 2GB
- Node.js: 1–2 worker processes (cluster module)

### Tier 3 (Horizontal Scaling)
```
┌──────────────────┐
│  Browser/Phone   │
│   (WebSocket)    │
└────────┬─────────┘
         │
    Headscale VPN
         │
    ┌────▼──────────┐
    │  Nginx LB      │
    │ (sticky sess)  │
    └────┬────┬────┬┘
    ┌────▼┐┌──▼─┐┌─▼──┐
    │Node1││Node2││Node3│
    │(600)││(600)││(600)│
    └────┬┘└──┬─┘└─┬──┘
    ┌────┴────┴───┴┐
    │  Redis Pub/Sub│
    │  (messaging)  │
    └────┬────────┘
         │
    ┌────▴──────┐
    │            │
  SQLite    PostgreSQL
  (local)    (leaderboard)
```

**Additional tools**:
- Nginx (load balancer)
- Redis (pub/sub, messaging)
- PostgreSQL (persistent store)
- Prometheus (monitoring)

### Tier 4 (Enterprise)
```
┌────────────────────┐
│  Browser/Phone     │
│   (CDN-routed)     │
└────────┬───────────┘
         │
   ┌─────▼─────────┐
   │ CloudFlare    │
   │ CDN           │
   └─────┬─────────┘
         │
   ┌─────▼──────────────┐
   │ Route 53 / GTM     │
   │ (geo-routing)      │
   └──┬──────────┬──┬───┘
   ┌──▼──┐ ┌──┬──▼──┐ ┌──▼──┐
   │  K8s│ │  K8s  │ │  K8s│
   │  US │ │ EU    │ │ APAC│
   │ (30 │ │ (30   │ │ (20 │
   │ pods)│ │pods)  │ │pods)│
   └──┬──┘ └──┬──┬──┘ └──┬──┘
   ┌──┴──────┘   └──────┴─────┐
   │                           │
   │     PostgreSQL Cluster    │
   │    (multi-region replica) │
   │                           │
   └───────────────────────────┘
```

**Additional tools**:
- Kubernetes (EKS/GKE/AKS)
- PostgreSQL with replication
- Redis Cluster
- Datadog/New Relic monitoring
- S3/GCS for backups
- ElastiCache for caching

---

## Migration Path Timeline

```
Q1 2026 ──► Q2 2026 ──► Q3 2026 ──► Q4 2026 ──► Q1 2027 ──► Q2 2027
  │           │           │           │           │           │
  │        Monitor        Plan       Upgrade     Evaluate      │
  │        Growth         Optional   Core       Scaling       Implement
  │                       SQLite    Deps        Proof-of-Concept
  │
  └─ ws@8.19.0 ✓ (Done immediately)
  └─ Docker hardening ✓ (Done immediately)
  └─ Node.js v24 (Late Q4)
  └─ Express 5.0 (Optional, if TypeScript added)
                       └─ SQLite leaderboard (If needed)
                                             └─ Horizontal scale POC (If 300+ concurrent seen)
                                                                   └─ Kubernetes migration (If 1,000+ concurrent)
```

---

## Metrics Monitoring Checklist

### Weekly (Add to standup)
- [ ] Peak concurrent players (monitor Headscale VPN)
- [ ] Any errors in server logs
- [ ] Database file size (questions-db.json)

### Monthly
- [ ] Docker memory usage trend
- [ ] CPU utilization at peak times
- [ ] Count of unique players per venue
- [ ] Game completion rate

### Quarterly
- [ ] Total games played (trend analysis)
- [ ] Average game duration
- [ ] Player retention (repeat players)
- [ ] Any scaling bottlenecks observed

### Dashboard Setup (Optional)

**Simple**: Use `docker stats` + spreadsheet
```bash
# Log stats every hour
watch -n 3600 'docker stats quiz-trivia-quiz-1 >> docker-stats.log'
```

**Better**: Prometheus + Grafana
```bash
docker run -d -p 9090:9090 prom/prometheus
docker run -d -p 3000:3000 grafana/grafana
# Create dashboard with Node.js exporter metrics
```

**Best**: Cloud monitoring (AWS CloudWatch, GCP Stackdriver)
```bash
# In docker-compose.yml, add CloudWatch agent
# Requires IAM role + CloudWatch agent config
```

---

## Decision Flowchart (Use This)

```
START: New upgrade/feature request
       │
       ├─ "Need better performance?"
       │  └─ YES: Is memory >500 MB?
       │         └─ YES: Vertical scale (increase Docker RAM)
       │         └─ NO: Check CPU utilization
       │              └─ CPU >60%: Add Nginx load balancer
       │              └─ CPU <60%: Code optimization review
       │
       ├─ "Need to track historical data?"
       │  └─ YES: Add SQLite (local) or PostgreSQL (cloud)
       │  └─ NO: Keep JSON files
       │
       ├─ "Planning to scale to 300+ concurrent?"
       │  └─ YES: Plan Nginx + Redis (Q1 2027)
       │  └─ NO: Stick with vertical scale
       │
       ├─ "Need 99.9% uptime SLA?"
       │  └─ YES: Plan Kubernetes (Q3 2027)
       │  └─ NO: Single instance sufficient
       │
       └─ "Any security concerns?"
          └─ YES: Upgrade ws + Docker hardening (Q1 2026)
          └─ NO: Standard upgrade path

DONE: Document decision in UPGRADE_ANALYSIS.md
```

---

## Breaking Point Analysis

### Practical Limits (Single Instance)

| Metric | Limit | Symptom | Action |
|--------|-------|---------|--------|
| Memory | 2 GB | GC pauses >100ms | Vertical scale or horizontal |
| File descriptors | 65,536 | "too many open files" | Increase ulimit or scale out |
| CPU | 100% | Message lag >1s | Add instances + load balancer |
| Connections | 10,000 | Memory exhaustion | Switch to Redis + horizontal |
| Games/hour | 1,000+ | Database contention | Add SQLite/PostgreSQL |
| Data size | 5 GB | Slow backups | Implement replication |

### Red Flags (Time to Scale)

When you see **3+ of these**, start scaling:
1. ⚠️ Memory usage consistently >1 GB
2. ⚠️ CPU peak >70% during games
3. ⚠️ WebSocket lag >500 ms observed
4. ⚠️ More than 5 rooms running simultaneously
5. ⚠️ "too many open files" errors in logs
6. ⚠️ Game start delay >3 seconds
7. ⚠️ Player complaints about lag/crashes

---

## Q&A: Common Questions

### "Should we migrate to Fastify now?"
**Answer**: No. Express is fine for this app scale. Fastify is 2–3x faster but requires full server rewrite (20+ hours). Only consider if throughput becomes bottleneck (1,000+ RPS), which is beyond WebSocket capacity anyway.

### "Do we need Kubernetes?"
**Answer**: Not yet. Docker Compose + Nginx is sufficient up to 1,000 concurrent players. Kubernetes adds $1,500+/mo overhead for <100 concurrent players. Wait until enterprise SLA required.

### "Should we add caching layer (Redis) now?"
**Answer**: Only if scaling horizontally (3+ instances). Single instance doesn't benefit from Redis caching; it just adds operational burden. Wait for Tier 3.

### "What about database replication?"
**Answer**: If using SQLite (Tier 2), do local backups only. Switch to PostgreSQL with replication only at Tier 4 (1,000+ concurrent).

### "Do we need a CDN?"
**Answer**: Not for this app (real-time games, high interactivity). CDN helps for static assets + API caching. Revisit at Tier 4 if geographic latency becomes issue.

### "How often should we upgrade dependencies?"
**Answer**:
- Security patches: Immediately (ws@8.19.0 example)
- Minor versions: Quarterly (v4.18.x → v4.20.x)
- Major versions: Annually if breaking changes tolerated (Express 4 → 5)

### "Should we add TypeScript now?"
**Answer**: Benefits (type safety, dev experience) vs. Cost (build setup, testing). Current codebase (1,000 LOC total) is small enough that JS is fine. Reconsider at 5,000+ LOC or when team grows >3 developers.

---

Last updated: March 7, 2026
Maintained by: @dellvall
