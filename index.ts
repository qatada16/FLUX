// Must come first: Android starts the app headless (no screens) to run the
// background catch-up scan, and the task has to be defined by then.
import './src/lib/backgroundScan';
import 'expo-router/entry';
