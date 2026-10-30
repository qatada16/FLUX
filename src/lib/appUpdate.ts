import * as Application from 'expo-application';
import { Directory, File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';

/**
 * A published build, from the `app_versions` table that `npm run release`
 * writes to (see scripts/release.mjs and supabase-app-versions.sql).
 */
export interface AppRelease {
  versionName: string;
  versionCode: number;
  releaseNotes: string;
  apkUrl: string;
  apkSizeBytes: number | null;
  /** True when this release, or any release between it and the installed one, must be installed. */
  mandatory: boolean;
  publishedAt: string;
}

const CHECK_TIMEOUT_MS = 8000;
const APK_MIME = 'application/vnd.android.package-archive';
// Intent.FLAG_GRANT_READ_URI_PERMISSION — lets the system installer read our file.
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;

/** The version this device is running: Android versionName and versionCode. */
export function installedVersion(): { name: string; code: number } {
  return {
    name: Application.nativeApplicationVersion ?? '?',
    code: parseInt(Application.nativeBuildVersion ?? '', 10) || 0,
  };
}

/**
 * The newest active release above the installed build, or null when this
 * device is up to date (or the check couldn't be made — offline, no cloud).
 */
export async function fetchAvailableUpdate(): Promise<AppRelease | null> {
  if (Platform.OS !== 'android' || !isSupabaseConfigured) return null;
  const installed = installedVersion();
  if (installed.code === 0) return null;

  const query = supabase
    .from('app_versions')
    .select('version_name, version_code, release_notes, apk_url, apk_size_bytes, mandatory, created_at')
    .eq('platform', 'android')
    .eq('is_active', true)
    .gt('version_code', installed.code)
    .order('version_code', { ascending: false })
    .limit(50);

  const response = await Promise.race([
    query,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), CHECK_TIMEOUT_MS)),
  ]);
  if (!response || response.error || !response.data || response.data.length === 0) return null;

  const rows = response.data;
  const latest = rows[0];
  return {
    versionName: latest.version_name,
    versionCode: latest.version_code,
    releaseNotes: latest.release_notes ?? '',
    apkUrl: latest.apk_url,
    apkSizeBytes: latest.apk_size_bytes ?? null,
    // Skipping a mandatory release isn't allowed even when a newer optional
    // one exists — installing the newest covers it.
    mandatory: rows.some((r) => r.mandatory),
    publishedAt: latest.created_at,
  };
}

function apkFileFor(release: AppRelease): File {
  return new File(Paths.cache, `flux-update-${release.versionCode}.apk`);
}

/**
 * Downloads the release's APK into the cache. Reuses a complete earlier
 * download, so tapping Update again after backing out of the installer is
 * instant.
 */
export async function downloadUpdate(
  release: AppRelease,
  onProgress: (fraction: number) => void
): Promise<File> {
  const target = apkFileFor(release);
  if (target.exists) {
    if (release.apkSizeBytes && target.size === release.apkSizeBytes) return target;
    target.delete();
  }
  return await File.downloadFileAsync(release.apkUrl, target, {
    idempotent: true,
    onProgress: ({ bytesWritten, totalBytes }) => {
      const total = totalBytes > 0 ? totalBytes : release.apkSizeBytes ?? 0;
      if (total > 0) onProgress(Math.min(1, bytesWritten / total));
    },
  });
}

/**
 * Hands the APK to Android's package installer. The first time, Android asks
 * the user to allow Flux to install apps; after that it goes straight to the
 * install screen. Resolves when the user comes back without installing.
 */
export async function installUpdate(apk: File): Promise<void> {
  await startActivityAsync('android.intent.action.VIEW', {
    data: apk.contentUri,
    type: APK_MIME,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}

/** Fallback: let the browser download the APK. */
export async function openUpdateInBrowser(release: AppRelease): Promise<void> {
  await Linking.openURL(release.apkUrl);
}

/** Deletes downloaded update APKs this device no longer needs. */
export function cleanUpOldDownloads(): void {
  if (Platform.OS !== 'android') return;
  try {
    const installed = installedVersion().code;
    for (const entry of new Directory(Paths.cache).list()) {
      const match = /^flux-update-(\d+)\.apk$/.exec(entry.name);
      if (match && entry instanceof File && parseInt(match[1], 10) <= installed) entry.delete();
    }
  } catch {
    // The cache is the system's to clear anyway.
  }
}

export function formatBytes(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
