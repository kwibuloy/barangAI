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

You need JDK 21 and the Android SDK (platform 36), with the SDK path in `apps/mobile/android/local.properties` as `sdk.dir=...`. On this laptop it's in `D:\Android\Sdk`. Don't install it from inside the Claude app: Windows redirects its `AppData` writes to the app's private storage, where a normal terminal can't find them.

```powershell
cd apps/mobile; npm ci; npm run apk
```

If Gradle stops with `Unable to establish loopback connection`, set `$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=D:/gradle-tmp -Djava.io.tmpdir=D:/gradle-tmp'` to an existing folder with no spaces in its path, and build again.

The APK is at `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. With USB debugging on:

```powershell
& "D:\Android\Sdk\platform-tools\adb.exe" install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

On first launch, enter the Phone address. The app remembers it and asks again whenever it can't reach the laptop, for example after the laptop's address changes. `apps/mobile/android/.../MainActivity.java` holds this.

Website changes reach the phone after a website build and an app reload. Only changes under `apps/mobile` need a new APK.

## Data

The launcher always uses `barangai-dev.db` and `private_media/`. For synthetic accounts and reports, see `.claude/skills/seed-demo/SKILL.md`. Forgotten passwords are reset from the command line.

The demo accounts are `resident1@demo.test` (resident), `staff@demo.test` (staff, barangay San Jose) and `admin@demo.test` (administrator). They are for synthetic demos only: before real residents use this database, start a fresh one or give each account its own password with `python -m barangai.bootstrap_staff <email> --reset-password`. Their shared password is noted as `SEED_DEMO_PASSWORD` in the git-ignored `.env`, and it stays the same across restarts and repeat seeding. Nothing reads that note: on a fresh database, set the variable in the shell before seeding, and editing it never changes an existing account's password. Staff only see reports pinned inside their barangay, so move the account to the demo location's barangay from `apps/api`, with `DATABASE_URL` pointing at `barangai-dev.db`: `python -m barangai.bootstrap_staff staff@demo.test --barangay "Name" --assign`. The administrator sees every report. The database covers Dasmariñas and the barangays around DLSU Taft; at Taft, the official shapes put the campus reading we tested in Barangay 719.

The cloud vision model and street names still need internet on the laptop, and map tiles need it on the phone. Without it the local checker fills in the category and the pin can be typed in as coordinates.
