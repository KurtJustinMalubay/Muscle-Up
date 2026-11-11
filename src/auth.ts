import { Platform } from "react-native";

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

async function googleSignIn() {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error("Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and configure native Google Sign-In client IDs first.");
  }
  const { GoogleSignin } = await import("@react-native-google-signin/google-signin");
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    scopes: [DRIVE_SCOPE],
  });
  return GoogleSignin;
}

export async function googleAccountEmail() {
  if (!GOOGLE_WEB_CLIENT_ID) return null;
  const GoogleSignin = await googleSignIn();
  return GoogleSignin.getCurrentUser()?.user.email ?? null;
}

export async function hasGoogleAccount() {
  return Boolean(await googleAccountEmail());
}

export async function signInWithGoogle() {
  const GoogleSignin = await googleSignIn();
  if (Platform.OS === "android") await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  return result.user.email;
}

export async function signOutFromGoogle() {
  const GoogleSignin = await googleSignIn();
  await GoogleSignin.signOut();
}

export async function googleDriveAccessToken() {
  const GoogleSignin = await googleSignIn();
  const user = await GoogleSignin.addScopes({ scopes: [DRIVE_SCOPE] });
  if (!user) throw new Error("Google Drive appData permission was not granted.");
  const { accessToken } = await GoogleSignin.getTokens();
  if (!accessToken) throw new Error("Google did not provide a Drive access token.");
  return accessToken;
}
