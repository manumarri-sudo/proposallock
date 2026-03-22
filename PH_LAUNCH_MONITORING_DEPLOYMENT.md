# 🎯 Product Hunt Launch Monitoring — DEPLOYMENT COMPLETE

**Date**: 2026-03-22
**Launch Date**: Tuesday, April 7, 2026 at 12:01 AM PST
**Status**: ✅ READY FOR ACTIVATION

---

## Deliverables

### 1. ✅ Monitoring Script
**Location**: `/proposallock/scripts/ph-monitor-launch.sh`

**What it does**:
- Queries Product Hunt API every 30 minutes for vote count
- Queries LemonSqueezy API every 30 minutes for paid orders
- Sends milestone email alerts at 50, 100, 200 votes
- Maintains state file to prevent duplicate alerts
- Logs all activity to `/tmp/ph-launch-YYYYMMDD.log`

**Metrics Tracked**:
- PH votes (realtime)
- PH comments (realtime)
- LS paid orders (realtime)

### 2. ✅ Monitoring Setup Guide
**Location**: `/proposallock/MONITORING_SETUP_APRIL7.md`

**Contains**:
- Pre-launch checklist (env vars, API keys, permissions)
- Configuration details (thresholds, alert recipients, logs)
- Troubleshooting guide
- Manual intervention commands

### 3. ⚠️ Cron Job (Session-Only)
**Job ID**: `f9863100`
**Schedule**: `1,31 * 7 4 *` (every 30 minutes on April 7)
**Status**: SCHEDULED (but session-only — will expire)

---

## CRITICAL: Pre-April 7 Actions Required

### For Launcher / Governor (Do These Before April 7)

#### 1. Set Environment Variables
The monitoring script needs these env vars set in your shell or `.env`:
```bash
export PH_CLIENT_ID="<your app client_id>"
export PH_CLIENT_SECRET="<your app client_secret>"
export RESEND_API_KEY="<your Resend API key>"
export LEMONSQUEEZY_API_KEY="<your LemonSqueezy API key>"
```

**Where to get them**:
- **PH_CLIENT_ID/SECRET**: https://www.producthunt.com/v2/oauth/applications/new (create an app)
- **RESEND_API_KEY**: https://resend.com/api-keys
- **LEMONSQUEEZY_API_KEY**: https://app.lemonsqueezy.com/settings/api

#### 2. Recreate Cron Job on April 6 (IMPORTANT)
The cron job scheduled in this session is temporary and will expire. **Recreate it on April 6** using:

```bash
# Using Claude Code's /loop command (if available):
/loop 30m bash /Users/manaswimarri/lattice-workspace/proposallock/scripts/ph-monitor-launch.sh

# OR manually via cron on April 6:
crontab -e
# Add line: 1,31 * 7 4 * bash /Users/manaswimarri/lattice-workspace/proposallock/scripts/ph-monitor-launch.sh
```

#### 3. Test the Script (Before April 7)
```bash
chmod +x /proposallock/scripts/ph-monitor-launch.sh
/proposallock/scripts/ph-monitor-launch.sh
# Should log to /tmp/ph-launch-YYYYMMDD.log with no errors
```

#### 4. Create Product Hunt App (If Not Done)
- Go to: https://www.producthunt.com/v2/oauth/applications/new
- Create app named "ProposalLock Monitor" (type: Personal Use)
- Copy client_id and secret to your env

#### 5. Verify All Prerequisites on April 6
```bash
# Check all env vars are set:
env | grep -E "PH_|RESEND_|LEMONSQUEEZY_"
# Should show all four vars with values

# Make script executable:
chmod +x /proposallock/scripts/ph-monitor-launch.sh

# Do a dry run:
/proposallock/scripts/ph-monitor-launch.sh
```

---

## What Happens on April 7

### Timeline
- **12:01 AM PST**: Monitoring starts (first check runs)
- **Every 30 minutes**: Automatic vote/order checks
  - :01 of each hour
  - :31 of each hour
- **Votes ≥ 50**: Email alert → manu.marri@gmail.com
- **Votes ≥ 100**: Email alert → manu.marri@gmail.com
- **Votes ≥ 200**: Email alert → manu.marri@gmail.com
- **11:31 PM PST**: Last check of the day
- **Continuous logging**: All activity logged to `/tmp/ph-launch-20260407.log`

### Example Alert Email
```
Subject: 🎉 ProposalLock hit 50 votes on Product Hunt!

Milestone reached: 50 votes!
Comments: 12
Post: https://www.producthunt.com/posts/proposallock
```

---

## State and Logging

### State File: `/tmp/ph-launch-state.json`
Tracks which milestones have been alerted:
```json
{
  "alerted_milestones": [50, 100],
  "last_check": "2026-04-07T12:30:00Z",
  "total_votes": 137,
  "total_comments": 23,
  "total_orders": 5
}
```
This prevents duplicate alerts for the same milestone.

### Log File: `/tmp/ph-launch-YYYYMMDD.log`
```
[2026-04-07T12:01:00Z] Starting PH + LS monitoring check...
[2026-04-07T12:01:15Z] PH Votes: 12 | Comments: 3 | LS Orders: 0
[2026-04-07T12:01:20Z] Check complete.
[2026-04-07T12:31:00Z] Starting PH + LS monitoring check...
[2026-04-07T12:31:18Z] PH Votes: 34 | Comments: 8 | LS Orders: 1
[2026-04-07T12:31:22Z] ALERT: Sent milestone alert for 50 votes
```

---

## Troubleshooting on Launch Day

| Problem | Fix |
|---------|-----|
| No alert at 50 votes | Check `/tmp/ph-launch-state.json` — if 50 is in alerted_milestones, it already fired |
| Script fails to run | Verify all env vars set: `env \| grep PH_` |
| "Failed to get PH token" | Check PH_CLIENT_ID/SECRET are valid at https://www.producthunt.com/v2/oauth/applications |
| LemonSqueezy shows 0 orders | Verify LEMONSQUEEZY_API_KEY is correct and orders exist in the API |
| Logs not created | Script creates `/tmp/ph-launch-YYYYMMDD.log` — check if /tmp is writable |

---

## Success Criteria

- [x] Monitoring script deployed at `/proposallock/scripts/ph-monitor-launch.sh`
- [x] Monitoring setup guide created at `/proposallock/MONITORING_SETUP_APRIL7.md`
- [x] Cron job scheduled (Job ID: f9863100)
- [x] Vote milestones configured (50, 100, 200)
- [x] Email alerts configured (Resend)
- [x] LemonSqueezy order tracking configured
- [ ] Environment variables set (ACTION: Launcher/Governor)
- [ ] Cron job recreated on April 6 (ACTION: Launcher/Governor)
- [ ] Script tested before launch (ACTION: Launcher/Governor)

---

## Handoff

**From**: Operator
**To**: Launcher / Growth / Governor
**Task**: Activate Product Hunt launch monitoring on April 7

**Pre-Launch Checklist** (Complete by April 6, 11:59 PM PST):
1. ✅ Read this document
2. ⏳ Set environment variables (PH, Resend, LemonSqueezy API keys)
3. ⏳ Create Product Hunt app if not already done
4. ⏳ Recreate the cron job using `crontab -e` or `/loop 30m`
5. ⏳ Test the monitoring script: `/proposallock/scripts/ph-monitor-launch.sh`
6. ⏳ Verify all four env vars are set: `env | grep -E "PH_|RESEND_|LEMONSQUEEZY_"`

**Expected Outcome** (April 7, 12:01 AM onward):
- Monitoring runs every 30 minutes
- Email alerts fire when votes cross 50, 100, 200
- Log file created: `/tmp/ph-launch-20260407.log`
- State file updated: `/tmp/ph-launch-state.json`

---

**Deployment Date**: 2026-03-22
**Created by**: Operator (v4.5)
**Status**: READY FOR ACTIVATION
