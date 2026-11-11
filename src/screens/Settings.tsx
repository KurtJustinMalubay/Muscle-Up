import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Apple, ArrowLeft, Bot, ChevronRight, CircleHelp, Dumbbell, Search, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { deletePhoto, getFitnessProfile, getUserMetrics, listPhotos, saveFitnessProfile, savePhoto, type NutritionTargets } from "../db";
import { getApiBaseUrl, requestApi, setApiBaseUrl } from "../api";
import { getNutritionTargets, saveNutritionTargets } from "../db";
import { restoreEncryptedBackup, uploadEncryptedBackup } from "../sync";
import { googleAccountEmail, googleDriveAccessToken, signInWithGoogle, signOutFromGoogle } from "../auth";

const VAULT_DIRECTORY = `${FileSystem.documentDirectory}muscle-up-vault/`;

type Props = { onReplayTutorial: () => void; onClose?: () => void };
type Photo = { id: string; local_uri: string; created_at: number };
type DietResult = { plan: unknown; safety_flags: string[]; disclaimer: string; message?: string };
type SettingsCategory = "profile" | "training" | "nutrition" | "ai" | "privacy" | "app";

const SETTINGS_CATEGORIES: {
  id: SettingsCategory;
  title: string;
  description: string;
  terms: string;
  icon: typeof UserRound;
}[] = [
  { id: "profile", title: "Profile & metrics", description: "Your name, age, and body measurements", terms: "name age weight height gender target", icon: UserRound },
  { id: "training", title: "Training preferences", description: "Experience, equipment, and movement constraints", terms: "workout fitness level equipment injuries joints", icon: Dumbbell },
  { id: "nutrition", title: "Nutrition", description: "Food preferences, daily targets, and meal plans", terms: "diet food calories protein carbs fat budget pantry", icon: Apple },
  { id: "ai", title: "AI & connected services", description: "Coach connection, API address, and Google sign-in", terms: "gemini api server render google connected account", icon: Bot },
  { id: "privacy", title: "Privacy & your data", description: "Private photos, encrypted backup, and stored data", terms: "privacy vault photos drive backup encryption", icon: ShieldCheck },
  { id: "app", title: "App preferences", description: "Tutorial and how Muscle Up behaves", terms: "tutorial help preferences app", icon: SlidersHorizontal },
];

export default function Settings({ onReplayTutorial, onClose }: Props) {
  const [section, setSection] = useState<SettingsCategory | null>(null);
  const [search, setSearch] = useState("");
  const [key, setKey] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consentedAt, setConsentedAt] = useState<number | null>(null);
  const [dietaryPreferences, setDietaryPreferences] = useState("");
  const [vault, setVault] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [age, setAge] = useState("30");
  const [height, setHeight] = useState("170");
  const [weight, setWeight] = useState("70");
  const [targetWeight, setTargetWeight] = useState("70");
  const [tdee, setTdee] = useState("2000");
  const [budget, setBudget] = useState("100");
  const [waist, setWaist] = useState("0");
  const [chest, setChest] = useState("0");
  const [gender, setGender] = useState("unspecified");
  const [fitnessLevel, setFitnessLevel] = useState("beginner");
  const [goal, setGoal] = useState("strength");
  const [equipment, setEquipment] = useState("barbell, bench, dumbbell, rack, pullup_bar");
  const [jointConstraints, setJointConstraints] = useState("");
  const [pantry, setPantry] = useState("");
  const [conditions, setConditions] = useState("");
  const [mealPlan, setMealPlan] = useState<DietResult | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nutritionTargetInputs, setNutritionTargetInputs] = useState<Record<keyof NutritionTargets, string>>({
    calories: "2000", protein: "130", carbs: "220", fat: "65",
  });

  useEffect(() => {
    SecureStore.getItemAsync("muscle-up-gemini-api-key").then((value) => setKey(value ?? "")).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not read the saved API key.");
    });
    getApiBaseUrl().then(setApiUrl).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not load the API address.");
    });
    googleAccountEmail().then(setEmail).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not read Google Sign-In status.");
    });
    listPhotos().then(setPhotos).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not load your photo vault.");
    });
    Promise.all([getFitnessProfile(), getUserMetrics(), getNutritionTargets()]).then(([profile, metrics, targets]) => {
      setDisplayName(profile.displayName ?? "");
      setConsentedAt(profile.consentedAt ?? null);
      setDietaryPreferences((profile.dietaryPreferences ?? []).join(", "));
      setFitnessLevel(profile.fitnessLevel);
      setGoal(profile.primaryGoal);
      setEquipment(profile.equipment.join(", "));
      setJointConstraints(profile.jointConstraints.join(", "));
      setNutritionTargetInputs({
        calories: String(targets.calories),
        protein: String(targets.protein),
        carbs: String(targets.carbs),
        fat: String(targets.fat),
      });
      if (metrics) {
        setAge(String(metrics.age));
        setGender(metrics.gender);
        setHeight(String(metrics.heightCm));
        setWeight(String(metrics.currentWeightKg));
        setTargetWeight(String(metrics.targetWeightKg));
        setTdee(String(metrics.tdee));
        setBudget(String(metrics.weeklyBudget ?? 100));
        setWaist(String(metrics.waistCm ?? 0));
        setChest(String(metrics.chestCm ?? 0));
      }
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not load your fitness profile.");
    });
  }, []);

  const saveApiUrl = async () => {
    setBusy("Saving API address");
    setError("");
    try {
      setApiUrl(await setApiBaseUrl(apiUrl));
      setNotice("API address saved on this device.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the API address.");
    } finally {
      setBusy("");
    }
  };

  const checkApiConnection = async () => {
    setBusy("Checking API connection");
    setError("");
    try {
      const result = await requestApi<{ status: string }>("health", undefined, "GET");
      if (result.status !== "ok") throw new Error("The API responded, but did not report a healthy status.");
      setNotice("Connected to the Muscle Up API.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not check the API connection.");
    } finally {
      setBusy("");
    }
  };

  const saveTargets = async () => {
    setBusy("Saving nutrition targets");
    setError("");
    try {
      await saveNutritionTargets(Object.fromEntries(
        Object.entries(nutritionTargetInputs).map(([field, value]) => [field, Number(value)]),
      ) as NutritionTargets);
      setNotice("Daily nutrition targets saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save nutrition targets.");
    } finally {
      setBusy("");
    }
  };

  const saveKey = async () => {
    try {
      if (key.trim()) await SecureStore.setItemAsync("muscle-up-gemini-api-key", key.trim());
      else await SecureStore.deleteItemAsync("muscle-up-gemini-api-key");
      setNotice("Gemini API key saved securely on this device.");
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not securely save the API key.");
    }
  };

  const signIn = async () => {
    setBusy("Signing in");
    setError("");
    try {
      setEmail(await signInWithGoogle());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Google Sign-In failed.");
    } finally {
      setBusy("");
    }
  };

  const signOut = async () => {
    setBusy("Signing out");
    setError("");
    try {
      await signOutFromGoogle();
      setEmail(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Google Sign-Out failed.");
    } finally {
      setBusy("");
    }
  };

  const withDriveAccess = async (action: (token: string) => Promise<void>) => {
    if (!email) throw new Error("Sign in with Google before using Drive sync.");
    if (backupPassphrase.trim().length < 8) throw new Error("Enter a backup passphrase of at least 8 characters.");
    await action(await googleDriveAccessToken());
  };

  const syncBackup = async (restore: boolean) => {
    setBusy(restore ? "Restoring backup" : "Encrypting and uploading");
    setError("");
    try {
      await withDriveAccess((token) => restore
        ? restoreEncryptedBackup(token, backupPassphrase)
        : uploadEncryptedBackup(token, backupPassphrase));
      setBackupPassphrase("");
      setNotice(restore ? "Backup restored. Reopen the app screens to refresh your data." : "Encrypted backup uploaded to your private Google Drive appDataFolder.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Drive sync failed.");
    } finally {
      setBusy("");
    }
  };

  const addPhoto = async () => {
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error("Photo library permission is required to select a progress photo.");
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
      if (result.canceled) return;
      if (!FileSystem.documentDirectory) throw new Error("Private app storage is unavailable on this device.");
      const directory = await FileSystem.getInfoAsync(VAULT_DIRECTORY);
      if (!directory.exists) await FileSystem.makeDirectoryAsync(VAULT_DIRECTORY, { intermediates: true });
      const extension = result.assets[0].fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "jpg";
      const fileUri = `${VAULT_DIRECTORY}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      await FileSystem.copyAsync({ from: result.assets[0].uri, to: fileUri });
      await savePhoto(fileUri);
      setPhotos(await listPhotos());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your progress photo.");
    }
  };

  const confirmDeletePhoto = (photo: Photo) => {
    Alert.alert("Delete progress photo?", "This permanently removes the photo from this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        void (async () => {
          try {
            const info = await FileSystem.getInfoAsync(photo.local_uri);
            if (info.exists) await FileSystem.deleteAsync(photo.local_uri);
            await deletePhoto(photo.id);
            setPhotos(await listPhotos());
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not delete the progress photo.");
          }
        })();
      } },
    ]);
  };

  const makeMealPlan = async () => {
    const values = [age, height, weight, targetWeight, tdee, budget].map(Number);
    if (values.some((value) => !Number.isFinite(value) || value <= 0) || !Number.isInteger(values[0])) {
      setError("Enter a whole-number age and positive values for measurements, calories, and budget.");
      return;
    }
    setBusy("Generating meal plan");
    setError("");
    setMealPlan(null);
    try {
      const result = await requestApi<DietResult>("generate-diet", {
        age: values[0], gender, height_cm: values[1], weight_kg: values[2],
        target_weight_kg: values[3], tdee: values[4], weekly_budget: values[5],
        pantry: pantry.split(",").map((value) => value.trim()).filter(Boolean),
        conditions: conditions.split(",").map((value) => value.trim()).filter(Boolean),
      });
      setMealPlan(result);
      setNotice("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate a meal plan.");
    } finally {
      setBusy("");
    }
  };

  const saveProfile = async () => {
    const values = [age, height, weight, targetWeight, tdee, budget, waist, chest].map(Number);
    if (values.slice(0, 6).some((value) => !Number.isFinite(value) || value <= 0) ||
        values.slice(6).some((value) => !Number.isFinite(value) || value < 0) || !Number.isInteger(values[0])) {
      setError("Enter a whole-number age and positive values for your measurements, calories, and budget.");
      return;
    }
    if (!displayName.trim()) {
      setError("Add your name before saving your profile.");
      return;
    }
    setBusy("Saving profile");
    setError("");
    try {
      await saveFitnessProfile({
        displayName,
        fitnessLevel: fitnessLevel.trim() || "beginner",
        primaryGoal: goal.trim() || "strength",
        equipment: equipment.split(",").map((item) => item.trim()).filter(Boolean),
        jointConstraints: jointConstraints.split(",").map((item) => item.trim()).filter(Boolean),
        dietaryPreferences: dietaryPreferences.split(",").map((item) => item.trim()).filter(Boolean),
        consentedAt,
      }, {
        age: values[0], gender: gender.trim() || "unspecified", heightCm: values[1],
        currentWeightKg: values[2], targetWeightKg: values[3], tdee: values[4],
        weeklyBudget: values[5], waistCm: values[6], chestCm: values[7],
      });
      setNotice("Fitness profile and metrics saved on this device.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your fitness profile.");
    } finally {
      setBusy("");
    }
  };

  const Button = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable disabled={Boolean(busy)} onPress={onPress} className="mb-3 items-center rounded-xl bg-clay p-4 disabled:opacity-50">
      <Text className="font-semibold text-ink">{label}</Text>
    </Pressable>
  );
  const Input = ({ value, onChangeText, placeholder, keyboardType }: { value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "numeric" | "default" }) => (
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} className="mb-3 rounded-xl border border-clay bg-white p-3 text-ink" />
  );

  const activeCategory = SETTINGS_CATEGORIES.find((item) => item.id === section);
  const visibleCategories = SETTINGS_CATEGORIES.filter((item) =>
    `${item.title} ${item.description} ${item.terms}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const heading = (title: string, description?: string) => (
    <View className="mb-4 mt-2">
      <Text className="text-lg font-bold text-ink">{title}</Text>
      {description ? <Text className="mt-1 text-sm leading-5 text-[#756E69]">{description}</Text> : null}
    </View>
  );

  return (
    <ScrollView className="flex-1 bg-canvas px-5 pt-5" contentContainerStyle={{ paddingBottom: 36 }}>
      <View className="mb-5 flex-row items-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={section ? "Back to settings" : "Back to app"}
          onPress={() => section ? setSection(null) : onClose?.()}
          className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-white"
        >
          <ArrowLeft size={20} color="#2C2C2C" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-2xl font-extrabold text-ink">{activeCategory?.title ?? "Settings"}</Text>
          <Text className="mt-1 text-sm text-[#756E69]">{activeCategory?.description ?? "Make Muscle Up work for you"}</Text>
        </View>
      </View>

      {!section ? (
        <>
          <View className="mb-4 flex-row items-center rounded-2xl bg-white px-4">
            <Search size={18} color="#817A75" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search settings"
              placeholderTextColor="#908984"
              accessibilityLabel="Search settings"
              className="min-h-12 flex-1 px-3 text-base text-ink"
            />
          </View>
          <View className="mb-4 rounded-2xl bg-white p-4">
            <View className="flex-row items-center">
              <View className="mr-3 h-12 w-12 items-center justify-center rounded-full bg-[#F9EAE3]">
                <UserRound size={22} color="#C85A32" />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-ink">{displayName.trim() || "Your profile"}</Text>
                <Text className="mt-1 text-xs text-[#756E69]">Fitness data is saved on this device</Text>
              </View>
            </View>
          </View>
          <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-[#817A75]">YOUR SETTINGS</Text>
          {visibleCategories.map((item) => {
            const CategoryIcon = item.icon;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => { setSection(item.id); setError(""); setNotice(""); }}
                className="mb-2 min-h-20 flex-row items-center rounded-2xl bg-white px-4 py-3 active:opacity-70"
              >
                <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-[#F8F3F0]">
                  <CategoryIcon size={20} color="#C85A32" />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-ink">{item.title}</Text>
                  <Text className="mt-1 text-xs leading-4 text-[#756E69]">{item.description}</Text>
                </View>
                <ChevronRight size={19} color="#817A75" />
              </Pressable>
            );
          })}
          {!visibleCategories.length ? <Text className="py-8 text-center text-sm text-[#756E69]">No settings match “{search}”.</Text> : null}
        </>
      ) : null}

      {section === "profile" ? (
        <>
          {heading("Your profile", "Your name and body metrics personalize your dashboard and recommendations.")}
          <Input value={displayName} onChangeText={setDisplayName} placeholder="Name" />
          <View className="flex-row">
            <View className="mr-2 flex-1"><Input value={age} onChangeText={setAge} placeholder="Age" keyboardType="numeric" /></View>
            <View className="flex-1"><Input value={gender} onChangeText={setGender} placeholder="Gender (optional)" /></View>
          </View>
          <View className="flex-row">
            <View className="mr-2 flex-1"><Input value={height} onChangeText={setHeight} placeholder="Height (cm)" keyboardType="numeric" /></View>
            <View className="flex-1"><Input value={weight} onChangeText={setWeight} placeholder="Weight (kg)" keyboardType="numeric" /></View>
          </View>
          <View className="flex-row">
            <View className="mr-2 flex-1"><Input value={targetWeight} onChangeText={setTargetWeight} placeholder="Target weight (kg)" keyboardType="numeric" /></View>
            <View className="flex-1"><Input value={waist} onChangeText={setWaist} placeholder="Waist (cm)" keyboardType="numeric" /></View>
          </View>
          <Input value={chest} onChangeText={setChest} placeholder="Chest (cm)" keyboardType="numeric" />
          <Button label="Save profile" onPress={saveProfile} />
        </>
      ) : null}

      {section === "training" ? (
        <>
          {heading("Training preferences", "These help tailor routines to your experience and what you can safely do.")}
          <Input value={fitnessLevel} onChangeText={setFitnessLevel} placeholder="Experience level" />
          <Input value={goal} onChangeText={setGoal} placeholder="Primary goal" />
          <Input value={equipment} onChangeText={setEquipment} placeholder="Available equipment (comma-separated)" />
          <Input value={jointConstraints} onChangeText={setJointConstraints} placeholder="Injuries or joint constraints (comma-separated)" />
          <Button label="Save training preferences" onPress={saveProfile} />
          <View className="mt-2 rounded-2xl bg-[#F2ECE8] p-4">
            <CircleHelp size={18} color="#756E69" />
            <Text className="mt-2 text-xs leading-5 text-[#756E69]">Routine suggestions are guidance, not medical advice. Stop any movement that causes pain.</Text>
          </View>
        </>
      ) : null}

      {section === "nutrition" ? (
        <>
          {heading("Nutrition", "Set flexible targets and preferences. Targets are guides, not a measure of success.")}
          <Input value={dietaryPreferences} onChangeText={setDietaryPreferences} placeholder="Food preferences (comma-separated)" />
          <Button label="Save food preferences" onPress={saveProfile} />
          <Text className="mb-2 mt-3 text-sm font-bold text-ink">Daily targets</Text>
          <View className="flex-row">
            <View className="mr-2 flex-1"><Input value={nutritionTargetInputs.calories} onChangeText={(value) => setNutritionTargetInputs((current) => ({ ...current, calories: value }))} placeholder="Calories (kcal)" keyboardType="numeric" /></View>
            <View className="flex-1"><Input value={nutritionTargetInputs.protein} onChangeText={(value) => setNutritionTargetInputs((current) => ({ ...current, protein: value }))} placeholder="Protein (g)" keyboardType="numeric" /></View>
          </View>
          <View className="flex-row">
            <View className="mr-2 flex-1"><Input value={nutritionTargetInputs.carbs} onChangeText={(value) => setNutritionTargetInputs((current) => ({ ...current, carbs: value }))} placeholder="Carbs (g)" keyboardType="numeric" /></View>
            <View className="flex-1"><Input value={nutritionTargetInputs.fat} onChangeText={(value) => setNutritionTargetInputs((current) => ({ ...current, fat: value }))} placeholder="Fat (g)" keyboardType="numeric" /></View>
          </View>
          <Button label="Save nutrition targets" onPress={saveTargets} />
          <Text className="mb-2 mt-5 text-sm font-bold text-ink">Meal plan preferences</Text>
          <View className="flex-row">
            <View className="mr-2 flex-1"><Input value={tdee} onChangeText={setTdee} placeholder="Daily calories" keyboardType="numeric" /></View>
            <View className="flex-1"><Input value={budget} onChangeText={setBudget} placeholder="Weekly budget" keyboardType="numeric" /></View>
          </View>
          <Input value={pantry} onChangeText={setPantry} placeholder="Pantry staples (comma-separated)" />
          <Input value={conditions} onChangeText={setConditions} placeholder="Dietary conditions to respect (optional)" />
          <Button label="Generate meal plan" onPress={makeMealPlan} />
          {mealPlan ? <View className="mb-4 rounded-2xl bg-white p-4">
            <Text className="mb-2 font-semibold text-ink">{mealPlan.message ?? "Meal plan"}</Text>
            {mealPlan.plan ? <Text selectable className="text-ink">{JSON.stringify(mealPlan.plan, null, 2)}</Text> : null}
            <Text className="mt-3 text-sm text-ink">{mealPlan.disclaimer}</Text>
          </View> : null}
        </>
      ) : null}

      {section === "ai" ? (
        <>
          {heading("AI & connected services", "AI features require your deployed backend. Local tracking works without a connection.")}
          <Text className="mb-2 text-sm font-bold text-ink">Backend connection</Text>
          <Text className="mb-2 text-xs leading-5 text-[#756E69]">Enter the HTTPS base address for your deployed Render service.</Text>
          <TextInput value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://your-service.onrender.com" className="mb-3 rounded-xl border border-clay bg-white p-3 text-ink" />
          <Button label="Save API address" onPress={saveApiUrl} />
          <Button label="Test API connection" onPress={checkApiConnection} />
          <Text className="mb-2 mt-4 text-sm font-bold text-ink">Gemini</Text>
          <Text className="mb-2 text-xs text-[#756E69]">Your key is stored securely on this device.</Text>
          <TextInput value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none" placeholder="Personal Gemini API key" className="mb-3 rounded-xl border border-clay bg-white p-3 text-ink" />
          <Button label="Save Gemini API key" onPress={saveKey} />
          <Text className="mb-2 mt-4 text-sm font-bold text-ink">Google</Text>
          {email ? <Text className="mb-3 text-sm text-[#756E69]">Signed in as {email}</Text> : null}
          <Button label={email ? "Sign out of Google" : "Sign in for private Drive sync"} onPress={email ? signOut : signIn} />
        </>
      ) : null}

      {section === "privacy" ? (
        <>
          {heading("Privacy & your data", "Your workouts, food log, and progress stay on your device unless you choose to back them up.")}
          <Text className="mb-2 text-sm font-bold text-ink">Progress photo vault</Text>
          <View className="mb-3 flex-row items-center justify-between rounded-2xl bg-white p-4">
            <Text className="flex-1 pr-3 text-sm text-ink">Keep progress photos in private app storage</Text>
            <Switch value={vault} onValueChange={setVault} trackColor={{ true: "#C85A32" }} />
          </View>
          {vault ? <>
            <Button label="Add progress photo" onPress={addPhoto} />
            <View className="mb-4 flex-row flex-wrap">
              {photos.map((photo) => <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={`Delete progress photo saved ${new Date(photo.created_at).toLocaleDateString()}`} onPress={() => confirmDeletePhoto(photo)}>
                <Image source={{ uri: photo.local_uri }} className="mb-2 mr-2 h-24 w-24 rounded-xl" />
              </Pressable>)}
            </View>
            {!photos.length ? <Text className="mb-3 text-xs leading-5 text-[#756E69]">Photos stay in app-private storage and are not uploaded or shared by the app.</Text> : null}
          </> : <Text className="mb-3 text-xs text-[#756E69]">The vault is hidden. Existing photos remain stored locally.</Text>}
          <Text className="mb-2 mt-4 text-sm font-bold text-ink">Encrypted Google Drive backup</Text>
          <Text className="mb-3 text-xs leading-5 text-[#756E69]">Backup data is encrypted on this device before upload. Your passphrase is never sent to Google.</Text>
          <TextInput value={backupPassphrase} onChangeText={setBackupPassphrase} secureTextEntry placeholder="Passphrase (8+ characters)" className="mb-3 rounded-xl border border-clay bg-white p-3 text-ink" />
          <Button label="Upload encrypted backup" onPress={() => syncBackup(false)} />
          <Button label="Restore encrypted backup" onPress={() => syncBackup(true)} />
        </>
      ) : null}

      {section === "app" ? (
        <>
          {heading("App preferences", "A few ways to get help and revisit the basics.")}
          <Pressable accessibilityRole="button" onPress={onReplayTutorial} className="mb-3 min-h-14 flex-row items-center rounded-2xl bg-white px-4">
            <CircleHelp size={19} color="#C85A32" />
            <Text className="ml-3 flex-1 font-semibold text-ink">Replay the getting-started guide</Text>
            <ChevronRight size={18} color="#817A75" />
          </Pressable>
          <Text className="mt-2 text-xs leading-5 text-[#756E69]">Muscle Up is designed to work offline. Connected AI features are optional.</Text>
        </>
      ) : null}

      {busy ? <View className="mb-3 mt-4 flex-row items-center"><ActivityIndicator color="#C85A32" /><Text className="ml-2 text-sm text-ink">{busy}…</Text></View> : null}
      {notice ? <Text accessibilityLiveRegion="polite" className="mt-3 rounded-xl bg-[#E8F2EC] p-3 text-sm text-ink">{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" className="mt-3 rounded-xl bg-[#F9EAE3] p-3 text-sm text-terracotta">{error}</Text> : null}
    </ScrollView>
  );
}
