# RUNME — Flux App

## 1. First-time Setup

### Prerequisites
- **Node.js** 18+ installed
- An **Android phone** for testing (SMS/notification features require a real device)
- An **Expo account** (free) at [expo.dev](https://expo.dev) — needed for EAS Build

### Install dependencies
```bash
cd flux-app
npm install
```

### Environment variables (optional — for cloud sync)
1. Create a free project at [supabase.com](https://supabase.com) (region: Singapore)
2. Copy your Project URL and `anon` public key from **Project Settings → API**
3. Create a `.env` file in the project root:
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```
4. In the Supabase SQL Editor, paste and run the full SQL schema (see Section 6 of `flux-app-build-prompt.md`)
5. In Supabase Dashboard → Authentication → Providers, ensure Email is enabled

> **Note:** The app works fully offline without Supabase. Just tap "Skip for now" on the login screen.

---

## 2. Running Locally

### Generate native project (first time or after native changes)
```bash
npx expo prebuild --clean
```

### Option A: Build and run locally (requires Android SDK + JDK)
```bash
npx expo run:android
```

### Option B: Build in the cloud with EAS
```bash
eas login                    # log into your Expo account
npm run build:dev            # builds a dev client APK in the cloud
```
Download and install the APK on your phone.

### Start the dev server
```bash
npm run start:dev            # connects to the dev client (not Expo Go)
```

> **Important:** This app uses custom native modules. It will **NOT** work with Expo Go. You must use the dev client APK.

---

## 3. Testing SMS / Notification Features

### SMS tracking
1. Configure a wallet with SMS tracking (e.g., JazzCash with sender `8558`). Add every
   sender ID the bank or wallet uses; anything typed in the box is saved even if you
   forget to tap **+ Add**.
2. Allow SMS when Flux asks (or Settings → **SMS Access**). If Android no longer shows the
   prompt, Flux sends you to the app's system settings page.
3. When a transaction SMS from that sender arrives, the balance updates and Flux posts a
   notification. This happens immediately if Flux is open or recently used, when you next
   open the app, or during the background check (every ~2 hours).

### Notification tracking
1. Settings → **Notification Access** → Android Settings → find **Flux** → toggle ON
2. Configure a wallet with notification tracking (e.g., SadaPay with package `com.sadapay.app`)
3. Wallet-app notifications are captured even while Flux is closed and applied on the next check

### How Flux avoids counting a transaction twice
- Every check reads the whole **catch-up window** (Settings, 7–90 days).
- Each message is fingerprinted (sender + time + text) and remembered once judged, so a
  re-read never re-applies it.
- Each wallet has an *anchor*: the moment its balance was last known to be exact (when you
  created it, typed a balance in, or a message stated the balance). Messages older than the
  anchor are treated as already included. So setting a balance by hand is always safe.
- **Check Now** reports how many wallet messages it found, how many were new, and how many
  were already counted.

### Requirements
- **Real Android device** — not an emulator (SMS won't work on emulator, and notification access is unreliable)
- Grant permissions as described above
- Background checks need a network connection (an Android WorkManager rule). On aggressive
  battery-saving phones (Xiaomi, Oppo, Vivo, Samsung), set Flux's battery usage to
  **Unrestricted**. Settings → **Background Checks** shows the status.

---

## 4. Releasing an Update

One command builds the APK, hosts it, and pushes the update popup to every installed copy:

```bash
npm run build:prod -- --notes "Fixed SMS reading|Faster balance updates"
```

(`npm run release` does the same. `|` starts a new line in the notes. Leave `--notes` out to
be asked, with a suggestion built from your recent commits.)

What it does:
1. Bumps the version name in `app.json` (patch: 1.0.1 → 1.0.2). Use `--bump minor|major|none`.
2. Runs the EAS production build. The build number (Android versionCode) is incremented by
   EAS (`autoIncrement` in `eas.json`); the app compares build numbers to detect updates.
3. Uploads the APK to a **GitHub Release** on this repo (permanent link; EAS links expire after 30 days).
4. Adds a row to the Supabase `app_versions` table. Every device checks that table when Flux
   opens, shows **Update available** with your notes, and **Update now** downloads the APK and
   opens Android's installer. Wallets and settings are kept.

Options: `--mandatory` (no "Later" button), `--build-id <id>` (publish an existing EAS build
without rebuilding), `--host eas` (skip GitHub), `--check` (verify setup only).

To withdraw a bad release, run this in the Supabase SQL Editor:
`update app_versions set is_active = false where version_code = <n>;`

### One-time setup
1. Run `supabase-app-versions.sql` in the Supabase SQL Editor.
2. Add `SUPABASE_SERVICE_ROLE_KEY=...` to `.env` (Supabase → Project Settings → API →
   `service_role`). It stays on your machine: `.env` is git-ignored and the key is never put
   in the app.
3. Make sure `gh auth status` shows you signed in to GitHub.
4. Run `npm run release:check`.

`npm run build:prod:only` still runs a plain EAS build that publishes nothing, and
`npm run build:preview` builds a test APK.

---

## 5. Sharing with Friends

1. Send them the GitHub Release link printed by `npm run build:prod` (the latest is always on
   the repo's Releases page)
2. The recipient needs to:
   - Allow their browser or file manager to **install unknown apps** when Android asks
   - Open the APK file to install
   - Grant SMS / Notification permissions as needed
3. After that, they get every new version through the in-app update popup. You don't need
   to send links again.
4. If they want cloud sync, they'll need to create an account in the app (the same Supabase project backs everyone)

---

## 6. Supabase Checklist (for new deployments)

- [ ] Create a Supabase project (region near Pakistan, e.g., Singapore)
- [ ] Run the SQL schema in the SQL Editor (creates `wallets` table + RLS policies)
- [ ] Run `supabase-transactions.sql`, `supabase-ai-keys.sql` and `supabase-app-versions.sql`
- [ ] Enable Email auth in Authentication → Providers
- [ ] Copy Project URL and anon key to `.env`
- [ ] `.env` is gitignored (safe — the anon key is client-safe due to RLS)
- [ ] Optionally disable "Confirm email" in Authentication → Settings for easier testing

---

## Project Structure

```
flux-app/
├── app/                          # Screens (expo-router, file-based)
│   ├── _layout.tsx               # Root layout, fonts, theme, listener init
│   ├── index.tsx                 # Boot router (auth check → dashboard or onboarding)
│   ├── dashboard.tsx             # Main dashboard with charts
│   ├── settings.tsx              # Settings & permissions
│   ├── auth/
│   │   ├── login.tsx             # Email/password login
│   │   └── signup.tsx            # Account creation
│   ├── onboarding/
│   │   ├── welcome.tsx           # Welcome screen
│   │   ├── select-wallets.tsx    # Pick wallets/banks
│   │   └── configure-wallets.tsx # Set balances & tracking
│   └── wallet/
│       └── [id].tsx              # Wallet detail & edit
├── modules/                      # Native Expo Modules (Kotlin)
│   ├── sms-listener/             # SMS BroadcastReceiver
│   └── notification-listener/    # NotificationListenerService
├── src/
│   ├── components/               # Reusable UI components
│   ├── constants/providers.ts    # Pakistani wallet/bank templates
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client
│   │   ├── sync.ts               # Cloud sync functions
│   │   ├── smsHandler.ts         # SMS → parser → wallet update
│   │   ├── notificationHandler.ts # Notification → parser → wallet update
│   │   ├── battery.ts            # Battery optimization helper
│   │   └── parsers/              # Transaction parser engine
│   ├── store/                    # Zustand stores (persisted)
│   ├── theme/                    # Color tokens & theme system
│   └── types/                    # TypeScript interfaces
├── app.json                      # Expo config
├── eas.json                      # EAS Build profiles
├── .env.example                  # Template for Supabase keys
└── tsconfig.json                 # TypeScript config
```
