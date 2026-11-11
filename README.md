# Muscle Up

Muscle Up is an offline-first Expo / React Native fitness app with local SQLite storage and an optional FastAPI + Gemini coach service. The Android app is a standalone native build; Expo Go is not required to install or use it.

## App setup

```powershell
npm install
npm run typecheck
npm test
```

On first launch, complete the six-step assessment. Training, food logging, goals, habits, body measurements, and workout history are stored locally and work without an API connection. Configure the API in **Settings → Backend connection** to use Coach and AI plan generation. The app accepts HTTPS service URLs and allows HTTP only for local development. Users may save their own Gemini key in Settings; otherwise the backend can use `GEMINI_API_KEY`.

## Deploy the backend to Render

1. Push this repository to a Git provider connected to Render.
2. In Render, create a Blueprint deployment from the repository root. [`render.yaml`](./render.yaml) configures the API service, Python runtime, install/start commands, and `/healthz` health check.
3. Optionally add `GEMINI_API_KEY` as a secret environment variable in the Render dashboard. If omitted, each user can supply a key in the app.
4. Wait for `/healthz` to report healthy, then copy the service's HTTPS URL into the app's Settings.

The API endpoints are `/api/v1/health`, `/api/v1/chat`, `/api/v1/generate-plan`, and `/api/v1/generate-diet`. The app uses a 90-second request timeout to account for cold starts on free hosting.

To run the backend locally:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

For Android emulators use `http://10.0.2.2:8000` as the local API address. On a physical phone use the development computer's LAN IP and ensure both devices are on the same network.

## Build an installable Android APK

The checked-in native Android project can build a standalone release APK (no Expo Go or Metro server required):

```powershell
cd android
.\gradlew.bat :app:assembleRelease
```

The output is `android/app/build/outputs/apk/release/app-release.apk`. For Play Store distribution, configure a private release signing key and build an Android App Bundle; never publish an APK signed with the local debug key.

## Product features

- Five-tab Today, Train, Eat, Progress, and Coach navigation with a guided first-run assessment.
- Local-first workouts, set logging, warm-ups, plate math, RPE-based progression, rest timer, haptics, and spoken cues.
- Daily meal and macro logging, editable targets, body measurements, goals, habit check-ins, and workout history.
- Offline workout-plan creation and JSON import/export; optional AI plan generation.
- Optional AI coach and budget-aware meal planning with backend safety checks and disclaimers.
- Private on-device progress-photo vault and encrypted Google Drive app-data backups.

The relational local store uses Expo SQLite. Database migrations add new tables and profile fields without removing existing workout data.
