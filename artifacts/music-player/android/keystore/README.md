# Splayer Android Release Signing

Set these environment variables before building a release APK:

```bash
export SPLAYER_STORE_PASSWORD=your_keystore_password
export SPLAYER_KEY_PASSWORD=your_key_password
```

Then build:

```bash
cd artifacts/music-player
pnpm run build:android
# open in Android Studio and run Build > Generate Signed Bundle/APK
```

If neither env var is set, the build falls back to the local development password.
The `.jks` keystore file must never be committed to version control.
