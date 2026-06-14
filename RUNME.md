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
1. Open Flux → Settings → tap **SMS Access** → grant permission
2. Configure a wallet with SMS tracking (e.g., JazzCash with sender `8558`)
3. Have someone send you an SMS from that sender containing a transaction message like:
   ```
   Rs.500 received from 03001234567
   ```
4. The wallet balance should update automatically on the dashboard

### Notification tracking
1. Open Flux → Settings → tap **Notification Access**
2. Follow the prompt to open Android Settings → find **Flux** → toggle ON
3. Configure a wallet with notification tracking (e.g., SadaPay with package `com.sadapay.app`)
4. When the SadaPay app posts a transaction notification, the balance updates

### Requirements
- **Real Android device** — not an emulator (SMS won't work on emulator, and notification access is unreliable)
- Grant permissions as described above
- For reliable background operation, go to Settings → Battery Optimization → exclude Flux from battery restrictions

---

## 4. Building a Release APK

### Preview build (for testing)
```bash
npm run build:preview
```

### Production build
```bash
npm run build:prod
```

Both output a downloadable `.apk` file from EAS. No Play Store needed.

---

## 5. Sharing with Friends

1. Build a **preview** or **production** APK using the commands above
2. Share the APK file directly (WhatsApp, Telegram, email, Google Drive, etc.)
3. The recipient needs to:
   - Enable **"Install from unknown sources"** in Android Settings → Security
   - Open the APK file to install
   - Grant SMS / Notification permissions as needed
4. If they want cloud sync, they'll need to create an account in the app (the same Supabase project backs everyone)

> **Alternative:** Use [Firebase App Distribution](https://firebase.google.com/docs/app-distribution) for a cleaner sharing experience with install links.

---

## 6. Supabase Checklist (for new deployments)

- [ ] Create a Supabase project (region near Pakistan, e.g., Singapore)
- [ ] Run the SQL schema in the SQL Editor (creates `wallets` table + RLS policies)
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
