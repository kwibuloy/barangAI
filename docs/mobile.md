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

## Data

The launcher always uses `barangai-dev.db` and `private_media/`. For synthetic accounts and reports, see `.claude/skills/seed-demo/SKILL.md`. Forgotten passwords are reset from the command line.

The demo accounts are `resident1@demo.test` (resident), `staff@demo.test` (staff, barangay San Jose) and `admin@demo.test` (administrator). They are for synthetic demos only: before real residents use this database, start a fresh one or give each account its own password with `python -m barangai.bootstrap_staff <email> --reset-password`. Their shared password is the `SEED_DEMO_PASSWORD` used when the database was seeded. Seeding doesn't save it anywhere, so write it in the git-ignored `.env` under that name; nothing reads it from there. A database that was never seeded has no demo accounts, so seed it first (`.claude/skills/seed-demo/SKILL.md`). Editing the note never changes an existing account's password: use `--reset-password` for that. Staff only see reports pinned inside their barangay, so move the account to the demo location's barangay from `apps/api`, with `DATABASE_URL` pointing at `barangai-dev.db`: `python -m barangai.bootstrap_staff staff@demo.test --barangay "Name" --assign`. The administrator sees every report. The database covers Dasmariñas and the barangays around DLSU Taft; at Taft, the official shapes put the campus reading we tested in Barangay 719.

The cloud vision model and street names still need internet on the laptop, and map tiles need it on the phone. Without it the local checker fills in the category and the pin can be typed in as coordinates.
