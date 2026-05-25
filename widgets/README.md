# HomeHub iOS Widget

A Scriptable home-screen widget that shows your **next not-yet-done-or-skipped task** for today, with live progress.

## What it looks like

```
┌────────────────────────────┐
│ HOMEHUB              3/12  │
│                            │
│ Push (Chest + Shoulders)   │
│ Next: Cable fly — set 2/4  │
│                            │
│ 7:00am               3/12  │
└────────────────────────────┘
```

Tap → opens HomeHub in Safari (or installed PWA if you added it to home).

## Install (one time, ~3 minutes)

1. Install **Scriptable** from the App Store (free).
2. Open Scriptable → **+** in the corner → paste the entire contents of `homehub.scriptable.js`.
3. Name it `HomeHub` and save.
4. (Optional) Edit the `USER` constant at the top — `'ethan'` or `'justin'`.
5. Long-press your home screen → **+** → search for **Scriptable** → pick **Medium** size → add.
6. Long-press the new widget → **Edit Widget**:
   - Script: `HomeHub`
   - When Interacting: `Run Script` (so taps fire a refresh too)
7. Done. iOS refreshes the widget every ~15 min on its own schedule.

## How it picks "next"

1. Loads today's scheduled events from Supabase (incl. any one-day routine swap).
2. Sorts by start time.
3. Walks events in order, and within each event walks sets / items in order.
4. Returns the first one where `done = false AND skipped = false`.

So if you skip a set or skip an exercise in the app, the widget jumps to the one after it. When everything is moved past, the widget shows **"All done for today 🎉"**.
