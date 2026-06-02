# Gym "On-Call" mode — silence everything except Scott

Goal: while you're at the gym, your phone is on Do-Not-Disturb **except** calls from
Scott still ring through. This lives on the iPhone (iOS can't be driven from the web
app), built from a **Focus** + a **Shortcuts automation**. ~5 minutes to set up once.

## 1. Create the "Gym" Focus
1. Settings → **Focus** → **+** (top right) → **Custom**.
2. Name it **Gym**, pick an icon (🏋️) → **Customize Focus**.
3. **People** → **Allow Notifications From** → add **Scott** only.
4. Tap **Options** under People → enable **Allow Calls From → Allowed People**
   (so only Scott's calls ring; "Allow Repeated Calls" optional).
5. **Apps** → **Silence Notifications From** → leave apps empty / silence all.

That alone = one tap from Control Center silences everything but Scott. The
automation below turns it on/off automatically around your workouts.

## 2a. Auto on/off by **location** (simplest, recommended)
1. Shortcuts app → **Automation** tab → **+** → **Create Personal Automation**.
2. **Arrive** → choose your gym's location → set a small radius → Next.
3. Add action **Set Focus** → **Gym** → **On**.
4. Turn **OFF "Ask Before Running"** → Done.
5. Repeat with **Leave** the same location → **Set Focus → Off** (or **Turn Off Focus**).

## 2b. Auto on/off by **gym calendar time** (if you'd rather it follow the schedule)
HomeHub gym sessions are calendar events, so a time trigger works too:
1. Shortcuts → Automation → **+** → **Time of Day** → set your usual lift start time
   (e.g. 12:55 PM) → which days → **Set Focus → Gym → On** → disable "Ask Before Running".
2. A second automation ~90 min later → **Set Focus → Off**.

## Notes
- Scott's contact must be a real entry in Contacts so the allow-list can target him.
- To allow-list more people later: Focus → Gym → People → Allow Calls From.
- Manual override anytime: long-press the Focus tile in Control Center.
- Nothing to deploy on the web side — this is phone-local.
