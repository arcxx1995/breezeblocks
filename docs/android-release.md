# Android Packaging and Play Games Setup

## Local Android Build

The Android project is generated with Capacitor and uses the static Next.js
export in `out/`.

```bash
npm run build
npm run android:sync
npm run android:open
```

To run directly from the command line:

```bash
npm run android:run
```

Android Studio is still required for emulator/device management, signing
configuration, release builds, and Play Console uploads.

## Firebase Web Config

The Android shell runs the same exported web app. Keep these public Firebase
values available before building:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

For emulator testing only:

```bash
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
```

Do not point a release Android build at local emulators.

## Google Play Games Auth Setup

The app ID is:

```text
com.breezeblocks.game
```

Console setup that must be completed in Google-owned dashboards:

1. Create the Android app in Google Play Console.
2. Create or connect the Firebase project.
3. Add the Android app package `com.breezeblocks.game` to Firebase.
4. Generate signing fingerprints from Android Studio or Gradle:

   ```bash
   cd android
   ./gradlew signingReport
   ```

5. Add debug and release SHA-1 fingerprints in Firebase.
6. Enable Firebase Authentication providers:
   - Anonymous
   - Google
   - Play Games
7. In Play Console, configure Play Games Services for this app.
8. Add both Game server and Android credentials in Play Games Services.
9. Add tester accounts before release.
10. Verify sign-in on a real device using the signed debug or release build.

The current code uses Firebase web Google sign-in for the Capacitor shell.
Native Play Games sign-in should be added with a Capacitor plugin or small
custom Android bridge when the Play Games Services credentials are available.
