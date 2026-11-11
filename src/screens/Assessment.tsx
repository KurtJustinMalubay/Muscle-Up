import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Check, Dumbbell, HeartPulse, Salad, ShieldCheck, Sparkles, Target } from "lucide-react-native";
import Button from "../components/Button";
import Card from "../components/Card";
import Field from "../components/Field";
import Pill from "../components/Pill";
import ProgressBar from "../components/ProgressBar";
import { saveFitnessProfile, type FitnessProfile } from "../db";

const STEPS = [
  { title: "What are you working toward?", detail: "We'll tailor your weekly training around your goal.", icon: Target },
  { title: "Where are you starting?", detail: "Your experience helps us suggest an appropriate pace.", icon: Sparkles },
  { title: "Anything we should work around?", detail: "Choose areas you'd like your training to protect.", icon: HeartPulse },
  { title: "What can you train with?", detail: "We'll only recommend movements that fit your setup.", icon: Dumbbell },
  { title: "How do you like to eat?", detail: "Food preferences help us make nutrition suggestions more useful.", icon: Salad },
  { title: "Your health, your data.", detail: "Your assessment stays on this device unless you choose to share it.", icon: ShieldCheck },
] as const;
const GOALS = ["Build muscle", "Get stronger", "Lose fat", "Feel fitter"];
const LEVELS = ["New to training", "Some experience", "Experienced"];
const INJURIES = ["No limitations", "Shoulders", "Back", "Knees", "Wrists"];
const EQUIPMENT = ["Bodyweight", "Dumbbells", "Barbell", "Bench", "Pull-up bar", "Cable machine", "Resistance bands", "Gym machines"];
const DIET = ["No preference", "Vegetarian", "Vegan", "Dairy-free", "Gluten-free"];

function toggle(values: string[], value: string) {
  if (value === "No limitations" || value === "No preference") return [value];
  const withoutDefaults = values.filter((item) => item !== "No limitations" && item !== "No preference");
  return values.includes(value) ? withoutDefaults.filter((item) => item !== value) : [...withoutDefaults, value];
}

function optionsToValues(values: string[], defaults: Record<string, string>) {
  return values.map((value) => defaults[value] ?? value.toLowerCase());
}

export default function Assessment({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(GOALS[0]);
  const [level, setLevel] = useState(LEVELS[0]);
  const [injuries, setInjuries] = useState<string[]>([INJURIES[0]]);
  const [equipment, setEquipment] = useState<string[]>(["Dumbbells"]);
  const [diet, setDiet] = useState<string[]>([DIET[0]]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const finish = async () => {
    if (!name.trim()) {
      setError("Enter your name to finish setting up your profile.");
      return;
    }
    if (!consent) {
      setError("Please review and accept the health-data notice to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const profile: FitnessProfile = {
        displayName: name.trim(),
        primaryGoal: goal.toLowerCase(),
        fitnessLevel: level.toLowerCase(),
        equipment: optionsToValues(equipment, {
          "Bodyweight": "bodyweight",
          "Dumbbells": "dumbbell",
          "Resistance bands": "resistance_band",
          "Gym machines": "cable_machine",
          "Cable machine": "cable_machine",
          "Pull-up bar": "pullup_bar",
        }),
        jointConstraints: injuries.includes("No limitations") ? [] : optionsToValues(injuries, {
          Shoulders: "shoulder",
          Back: "lower_back",
          Knees: "knee",
        }),
        dietaryPreferences: diet.includes("No preference") ? [] : optionsToValues(diet, { "Dairy-free": "dairy-free", "Gluten-free": "gluten-free" }),
        consentedAt: Date.now(),
      };
      await saveFitnessProfile(profile);
      onComplete();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your assessment.");
    } finally {
      setBusy(false);
    }
  };

  const current = STEPS[step];
  const Icon = current.icon;
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 24, paddingTop: 44, paddingBottom: 36 }}>
      <View className="mb-7 flex-row items-center">
        <View className="mr-3 h-12 w-12 items-center justify-center rounded-2xl bg-terracotta">
          <Dumbbell size={23} color="white" />
        </View>
        <View>
          <Text className="text-sm font-bold uppercase tracking-[3px] text-terracotta">MUSCLE UP</Text>
          <Text className="mt-1 text-xs text-[#756E69]">Your strength, your pace</Text>
        </View>
      </View>
      <ProgressBar value={((step + 1) / STEPS.length) * 100} height={5} />
      <Text className="mb-3 mt-4 text-xs font-bold uppercase tracking-widest text-[#817A75]">STEP {step + 1} OF {STEPS.length}</Text>
      <Card className="mb-5">
        <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl bg-[#F9EAE3]">
          <Icon size={23} color="#C85A32" />
        </View>
        <Text className="text-2xl font-extrabold leading-8 text-ink">{current.title}</Text>
        <Text className="mt-2 text-sm leading-5 text-[#756E69]">{current.detail}</Text>
      </Card>

      {step === 0 ? <>
        <Field label="What should we call you?" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" maxLength={50} />
        <Text className="mb-3 text-sm font-bold text-ink">My main goal</Text>
        <View className="flex-row flex-wrap">{GOALS.map((item) => <Pill key={item} label={item} selected={goal === item} onPress={() => setGoal(item)} />)}</View>
      </> : null}
      {step === 1 ? <View className="flex-row flex-wrap">{LEVELS.map((item) => <Pill key={item} label={item} selected={level === item} onPress={() => setLevel(item)} />)}</View> : null}
      {step === 2 ? <View className="flex-row flex-wrap">{INJURIES.map((item) => <Pill key={item} label={item} selected={injuries.includes(item)} onPress={() => setInjuries((currentValues) => toggle(currentValues, item))} />)}</View> : null}
      {step === 3 ? <View className="flex-row flex-wrap">{EQUIPMENT.map((item) => <Pill key={item} label={item} selected={equipment.includes(item)} onPress={() => setEquipment((currentValues) => toggle(currentValues, item))} />)}</View> : null}
      {step === 4 ? <View className="flex-row flex-wrap">{DIET.map((item) => <Pill key={item} label={item} selected={diet.includes(item)} onPress={() => setDiet((currentValues) => toggle(currentValues, item))} />)}</View> : null}
      {step === 5 ? (
        <Card className="mt-1">
          <Text className="text-base font-bold text-ink">Consent & privacy</Text>
          <Text className="mt-2 text-sm leading-5 text-[#756E69]">
            Muscle Up provides general fitness information, not medical advice. Your profile and activity are stored locally on this device. If you use Coach or AI plan generation, the information needed for that request is sent to the API server you configure.
          </Text>
          <Text className="mt-3 text-sm leading-5 text-[#756E69]">
            You can change or remove your profile and preferences in Settings. Do not use this app as a substitute for care from a qualified health professional.
          </Text>
          <View className="mt-5 flex-row items-center">
            <Button
              label={consent ? "Accepted" : "I understand and agree"}
              variant={consent ? "secondary" : "primary"}
              onPress={() => setConsent((accepted) => !accepted)}
            />
            {consent ? <Check size={19} color="#C85A32" style={{ marginLeft: 10 }} /> : null}
          </View>
        </Card>
      ) : null}

      {error ? <Text accessibilityRole="alert" className="my-3 text-sm font-medium text-terracotta">{error}</Text> : null}
      <View className="mt-7 flex-row">
        {step > 0 ? <View className="mr-3 flex-1"><Button label="Back" variant="secondary" onPress={() => { setError(""); setStep((value) => value - 1); }} /></View> : null}
        <View className="flex-1">
          <Button
            label={step === STEPS.length - 1 ? "Create my profile" : "Continue"}
            loading={busy}
            onPress={() => {
              if (step === STEPS.length - 1) void finish();
              else { setError(""); setStep((value) => value + 1); }
            }}
          />
        </View>
      </View>
      <Text className="mt-5 text-center text-xs text-[#908984]">You can update these choices any time.</Text>
    </ScrollView>
  );
}
