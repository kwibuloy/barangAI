# Running on a laptop and an Android phone

The laptop runs the website, API, database and photo storage. Staff use a browser on the laptop. Residents use the Android app, which loads the same site from the laptop over Wi-Fi. Both need to be on the same network, and the app works only while the laptop's server is running.

## Start the server

Build the website after any change to `apps/web`, then start the launcher in phone mode from the repo root:

```powershell
npm --prefix apps/web run build
```

```powershell
.\deploy\start-local.ps1 -Lan
```

It prints a **Phone address**. Staff open `http://127.0.0.1:8000` on the laptop.

Phone mode refuses to start while the database has `@demo.test` staff or administrator accounts, since anyone on the Wi-Fi could try them. For a synthetic demo, say so with `.\deploy\start-local.ps1 -Lan -Demo`. For real residents, start a fresh database.

Warnings and errors also go to `logs/barangai.log` (git-ignored, 5 MB, five old files kept), so a failure survives closing the window. Request lines stay on screen only, since they hold addresses and pins, and database errors leave out the row's values. A traceback can still name a report id.

If the phone can't connect, allow the server through Windows Firewall from an administrator terminal, and make sure the Wi-Fi is set to a Private network:

```powershell
New-NetFirewallRule -DisplayName "BarangAI" -Direction Inbound -Protocol TCP -LocalPort 8000 -Profile Private -Action Allow
```

To remove it later, run `Remove-NetFirewallRule -DisplayName "BarangAI"`. Use your own port if you passed `-Port`. Event and campus Wi-Fi often blocks devices from reaching each other; a phone hotspot avoids that, or connect by USB and enter `localhost` as the address after running:

```powershell
& "D:\Android\Sdk\platform-tools\adb.exe" reverse tcp:8000 tcp:8000
```

Traffic is plain HTTP, including passwords, so use a Wi-Fi network you trust. Google sign-in is off in phone mode: Google doesn't accept a private network address as a callback or sign-in inside an app's web view. Use password accounts.

## Build and install the app

You need JDK 21 and the Android SDK (platform 36), with the SDK path in `apps/mobile/android/local.properties` as `sdk.dir=...`, for example `D:\Android\Sdk` or `C:\Users\<you>\Android\Sdk`. Keep both out of `AppData` when installing from inside the Claude app: Windows redirects its `AppData` writes to the app's private storage, where Android Studio and a normal terminal can't find them. Android Studio 2026.2 bundles JDK 25, which this Gradle (8.14) can't run (`Unsupported class file major version 69`): set Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK to a JDK 21, such as Eclipse Temurin 21. The app is locked to portrait on phones (`AndroidManifest.xml`); Android 16 ignores the lock on tablets and unfolded foldables, which the tablet layout already handles.

```powershell
cd apps/mobile; npm ci; npm run apk
```

On a laptop with 8 GB of RAM the Gradle daemon can crash with an out-of-memory log (`hs_err_pid*.log`). Close other heavy apps, or cap it: `.\gradlew.bat assembleDebug --max-workers=1 "-Dorg.gradle.jvmargs=-Xmx1g -XX:+UseSerialGC" -Pkotlin.compiler.execution.strategy=in-process`.

If Gradle stops with `Unable to establish loopback connection`, set `$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=D:/gradle-tmp -Djava.io.tmpdir=D:/gradle-tmp'` to an existing folder with no spaces in its path, and build again.

The APK is at `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. With USB debugging on:

```powershell
& "D:\Android\Sdk\platform-tools\adb.exe" install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

On first launch, enter the Phone address. The app remembers it and asks again whenever it can't reach the laptop, for example after the laptop's address changes. `apps/mobile/android/.../MainActivity.java` holds this.

Website changes reach the phone after a website build and an app reload. Only changes under `apps/mobile` need a new APK.

## Rokid Glasses

Residents can report hands-free with Rokid Glasses. The phone needs the Rokid AI App, paired with the glasses. In BarangAI, open the account sheet (the avatar) and tap **Connect glasses**. The Rokid AI App asks for permission once, then the glasses open BarangAI's glasses app, which the phone app installs on them.

- **Press** the glasses button: take a photo. Kap finds the category, and the phone's GPS gives the pin.
- **Press** again on the confirm screen: send. The screen shows the AI disclaimer, and this press counts as the resident's check of the category and place. **Hold**, double-press or swipe back: cancel.
- When Kap finds no category, there's no GPS fix, or a report is already open nearby, the glasses say to finish on the phone, and the report form opens with the same photo.

The glasses app lives in `apps/mobile/android/glasses` and is built into the phone APK automatically. The Rokid SDKs come from Rokid's Maven repository, so the first build needs internet. The phone side is `RokidGlassesPlugin.java`, and the web side is `apps/web/src/features/glasses`. Both raise the app's minimum Android version to 9.

## Backups

The laptop holds the only copy of every report, photo and point balance. Back up to another drive, ideally on a schedule; the launcher warns if there's no backup yet. A backup holds private photos and account data unencrypted, so keep it on an encrypted drive. Deletions don't reach old backups: restoring one brings back accounts and reports deleted since it was made, so remove old backups on a set schedule. A restore erases them again, using the erasure ledger (ids only) in the database it replaces and in the backup, and reports how many in `reerased`. On a new laptop only the backup's own ledger exists, so redo any deletions made after that backup.

```powershell
.\deploy\backup.ps1 -To E:\BarangAI-backups
```

To restore, stop the server first. Anything replaced is renamed, never deleted, and photos work even if the new laptop uses a different folder:

```powershell
.\deploy\backup.ps1 -Restore E:\BarangAI-backups\barangai-backup-20261104-220000 -Replace
```

The server also keeps a copy beside the database, named `barangai-dev.before-<version>-<time>.db`, before each schema upgrade. Delete old copies once you've checked the upgrade: they contain deleted data too.

## Forgotten resident passwords (proposed procedure)

No email service exists, so a resident who forgets their password has to ask a person. This is a proposal: who may ask, and how identity is checked, is for the barangay and the owner to decide and write down. Until then, treat it as a draft.

1. **Who may ask.** The account holder, in person at the barangay hall. Not by phone or chat, and not a relative, unless the barangay decides otherwise. A minor's request needs the rule counsel gives (B2).
2. **How identity is checked.** The app holds only an email address, so an ID can't be matched to the account. Ask for a valid ID, then ask the person to describe something only the account holder knows: the email address itself and one of their reports (place and rough date). Staff read those from the desk and don't reveal them first.
3. **Who runs it.** An administrator, at the laptop, from a terminal: `python -m barangai.bootstrap_staff <email> --reset-password`. Neither the website nor the API resets residents' passwords. An administrator resets a staff member's through `/admin/staff`.
4. **What it does.** The administrator types a password the resident chooses or a temporary one; it signs out every device and clears the day's failed sign-ins. The resident changes a temporary one at once.
5. **Record.** Write the date, the account email and who checked in the hall's logbook. Keep no copy of the ID. The app keeps no log of this reset.
6. **If in doubt, refuse.** The resident can still make a new account. Points don't move between accounts.

## Data

The launcher always uses `barangai-dev.db` and `private_media/`. Some older photos may still sit in `apps/api/private_media`, where database rows point to them; leave that folder until they're moved. For synthetic accounts and reports, see `.claude/skills/seed-demo/SKILL.md`.

Administrators add, move, disable and reset staff accounts through `/admin/staff` (API only until its screen lands; `bootstrap_staff` still works); residents' passwords are reset from the command line, after the check below. To ban a resident, run `python -m barangai.bootstrap_staff <email> --disable` from `apps/api` with `DATABASE_URL` pointing at `barangai-dev.db` (`--enable` lifts it). `python -m barangai.metrics [--days 30]` prints follow-through and retention figures with no personal data.

The demo accounts are `resident1@demo.test` (resident), `staff@demo.test` (staff, barangay San Jose) and `admin@demo.test` (administrator). They are for synthetic demos only: before real residents use this database, start a fresh one. Each role has its own password: `SEED_DEMO_PASSWORD`, `SEED_DEMO_STAFF_PASSWORD` and `SEED_DEMO_ADMIN_PASSWORD`, with the last two generated and printed once when unset. A database seeded before this has one password for all of them. Seeding doesn't save passwords anywhere, so write them in the git-ignored `.env` under those names; nothing reads them from there. A database that was never seeded has no demo accounts, so seed it first (`.claude/skills/seed-demo/SKILL.md`). Editing the note never changes an existing account's password: use `--reset-password` for that. Staff only see reports pinned inside their barangay, so move the account to the demo location's barangay from `apps/api`, with `DATABASE_URL` pointing at `barangai-dev.db`: `python -m barangai.bootstrap_staff staff@demo.test --barangay "Name" --assign`. The administrator sees every report. The database covers Dasmariñas and the barangays around DLSU Taft; at Taft, the official shapes put the campus reading we tested in Barangay 719.

The cloud vision model and street names still need internet on the laptop, and map tiles need it on the phone. Without it the local checker fills in the category and the pin can be typed in as coordinates.
