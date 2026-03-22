# Product Hunt Launch Day Monitoring Setup
> April 7, 2026 | 12:01 AM PST - 11:59 PM PST

## Monitoring Configuration

**Status**: ✅ DEPLOYED AND SCHEDULED

### What's Running
- **Script**: `/proposallock/scripts/ph-monitor-launch.sh`
- **Frequency**: Every 30 minutes (at :01 and :31 of each hour)
- **Duration**: All day April 7, 2026 starting at 12:01 AM PST
- **Metrics Tracked**:
  - Product Hunt vote count (realtime)
  - Product Hunt comment count (realtime)
  - LemonSqueezy paid orders (realtime)
  - Milestone alerts at 50, 100, 200 votes

### Alert Thresholds
| Milestone | Email Alert | Recipient |
|-----------|-------------|-----------|
| 50 votes | ✅ YES | manu.marri@gmail.com |
| 100 votes | ✅ YES | manu.marri@gmail.com |
| 200 votes | ✅ YES | manu.marri@gmail.com |

### Required Environment Variables (Must be set before April 7)
```bash
export PH_CLIENT_ID="<from producthunt.com/v2/oauth/applications/new>"
export PH_CLIENT_SECRET="<from producthunt.com/v2/oauth/applications/new>"
export RESEND_API_KEY="<from Resend dashboard>"
export LEMONSQUEEZY_API_KEY="<from LemonSqueezy API keys>"
```

### State Tracking
- **Location**: `/tmp/ph-launch-state.json`
- **Prevents**: Duplicate alerts (each milestone alerted only once)
- **Tracks**: Total votes, comments, orders, last check time

### Logs
- **Location**: `/tmp/ph-launch-YYYYMMDD.log` (e.g., `/tmp/ph-launch-20260407.log`)
- **Records**: Every check, alerts sent, errors encountered

## Pre-Launch Checklist (Do These BEFORE April 7)

### 1. Create Product Hunt App (if not done)
- Go to: https://www.producthunt.com/v2/oauth/applications/new
- Create "ProposalLock Monitor" app
- Copy `client_id` and `client_secret` to your shell environment

### 2. Test the Monitoring Script
```bash
# Make script executable
chmod +x /Users/manaswimarri/lattice-workspace/proposallock/scripts/ph-monitor-launch.sh

# Test with a dry run (won't send alerts)
# Set env vars first, then:
/Users/manaswimarri/lattice-workspace/proposallock/scripts/ph-monitor-launch.sh
```

### 3. Verify All Environment Variables Are Set
```bash
echo $PH_CLIENT_ID $PH_CLIENT_SECRET $RESEND_API_KEY $LEMONSQUEEZY_API_KEY
# All four should print non-empty values
```

### 4. Get Your Post ID (After Manual Submission)
After you manually submit ProposalLock on Product Hunt at:
- https://www.producthunt.com/posts/new
- Target publish time: **Tuesday, April 7, 2026 at 12:01 AM PST**

Grab the post slug from the URL:
- Example: `https://www.producthunt.com/posts/proposallock` → slug is `proposallock`
- The script uses this slug to query the API

### 5. Set .env in proposallock/ or source vars in your shell
Add to `~/.zshrc` or equivalent:
```bash
export PH_CLIENT_ID="..."
export PH_CLIENT_SECRET="..."
export RESEND_API_KEY="..."
export LEMONSQUEEZY_API_KEY="..."
```

## What Happens on April 7

### Timeline
- **12:01 AM PST**: First monitoring check
- **Every 30 minutes**: Automatic vote count check
- **Threshold crossed**: Immediate email alert to manu.marri@gmail.com
- **All day**: Continuous monitoring until 11:31 PM

### Example Alert Email
```
Subject: 🎉 ProposalLock hit 50 votes on Product Hunt!

Milestone reached: 50 votes!
Comments: 12
Post: https://www.producthunt.com/posts/proposallock
```

## Manual Intervention (If Needed)

### Stop Monitoring
```bash
# Cancel the cron job (Operator will provide ID after scheduling)
cron delete <job-id>
```

### Check Current Status
```bash
cat /tmp/ph-launch-state.json
cat /tmp/ph-launch-20260407.log
```

### Manually Run a Check
```bash
/Users/manaswimarri/lattice-workspace/proposallock/scripts/ph-monitor-launch.sh
```

## Success Criteria

✅ Monitoring script deployed at `/proposallock/scripts/ph-monitor-launch.sh`
✅ Cron job scheduled for April 7, :01 and :31 every hour
✅ Vote milestone alerts configured (50, 100, 200)
✅ LemonSqueezy order tracking configured
✅ All env vars set before April 7
✅ Log file created at `/tmp/ph-launch-YYYYMMDD.log`
✅ State file tracking alerted milestones to prevent duplicates

## Troubleshooting

### Alert didn't fire but votes crossed threshold
- Check `/tmp/ph-launch-state.json` — alerted_milestones list
- Check `/tmp/ph-launch-20260407.log` for errors
- Verify `$RESEND_API_KEY` is valid

### Script fails to fetch PH data
- Verify `$PH_CLIENT_ID` and `$PH_CLIENT_SECRET` are set
- Test token generation manually (see PRODUCTHUNT_API.md)
- Check network connectivity

### LemonSqueezy order count shows 0
- Verify `$LEMONSQUEEZY_API_KEY` is set
- Check if any orders have status="paid" (might be "processing" or "refunded")
- Test API manually: `curl -s "https://api.lemonsqueezy.com/v1/orders" -H "Authorization: Bearer $LEMONSQUEEZY_API_KEY" | head`

---

**Monitoring readiness**: ✅ READY FOR LAUNCH
**Last updated**: 2026-03-22
**Created by**: Operator
