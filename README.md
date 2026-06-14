# Flux

**Your money, one view.** A personal multi-wallet and bank balance tracker for Pakistan.

Flux lets you see all your balances — JazzCash, Easypaisa, SadaPay, NayaPay, Meezan Bank, HBL, and more — in a single dark-themed dashboard with charts and live updates.

## Features

- **Unified Dashboard** — Total balance across all accounts, donut chart (% distribution), bar chart (comparison), and individual wallet cards
- **Auto Balance Updates** — Reads incoming SMS or app notifications to detect transactions and update balances in real-time
- **10 Pakistani Providers** — JazzCash, Easypaisa, SadaPay, NayaPay, Meezan Bank, Faysal Bank, HBL, UBL, Bank Alfalah, MCB (easily extensible)
- **Cloud Backup** — Supabase auth + sync so you never lose data when switching phones
- **Offline-First** — Works fully without internet; syncs when connected
- **Dark Mode** — Futuristic fintech design with mint/purple gradient accents

## Screenshots

*Coming soon — build the app and see for yourself!*

## Tech Stack

- **Expo SDK 56** + React Native + TypeScript
- **expo-router** — file-based navigation
- **Zustand** + AsyncStorage — state management with offline persistence
- **Supabase** — Postgres database + email/password auth
- **react-native-gifted-charts** — donut and bar charts
- **react-native-reanimated** — smooth animations
- **Custom Expo Modules (Kotlin)** — SMS BroadcastReceiver + Android NotificationListenerService

## Quick Start

```bash
# Install dependencies
npm install

# Generate native project
npx expo prebuild --clean

# Build dev client APK (cloud build)
eas login
npm run build:dev

# Start dev server
npm run start:dev
```

> **Note:** This app requires a custom dev build — it will not work with Expo Go.

See [RUNME.md](./RUNME.md) for full setup, testing, and deployment instructions.

## Project Structure

```
flux-app/
├── app/                          # Screens (expo-router)
│   ├── dashboard.tsx             # Main dashboard with charts
│   ├── settings.tsx              # Settings & permissions
│   ├── auth/                     # Login / signup
│   ├── onboarding/               # Welcome → select → configure
│   └── wallet/[id].tsx           # Wallet detail & edit
├── modules/                      # Native Kotlin modules
│   ├── sms-listener/             # SMS BroadcastReceiver
│   └── notification-listener/    # NotificationListenerService
├── src/
│   ├── components/               # Reusable UI components
│   ├── lib/                      # Supabase, sync, parsers, handlers
│   ├── store/                    # Zustand stores
│   ├── theme/                    # Color tokens & theme system
│   └── types/                    # TypeScript interfaces
├── RUNME.md                      # Full setup & deployment guide
└── eas.json                      # EAS Build profiles
```

## Android Only

This app is Android-only by design. iOS does not allow apps to read SMS or other apps' notifications. The UI code is cross-platform-friendly, but native features are guarded to only run on Android.

Distribution is via **sideloaded APK** (not Play Store), since Google heavily restricts SMS/notification permissions for non-default-SMS apps.

## License

Private project.
