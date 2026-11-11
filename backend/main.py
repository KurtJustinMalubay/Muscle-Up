"""Muscle Up stateless AI + RAG gateway. Run: uvicorn main:app --reload"""
import json, os
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
import google.generativeai as genai

KB = Path(__file__).parent / "knowledge"
LIBRARY = json.loads((KB / "library.json").read_text())["exercises"]
RULES = json.loads((KB / "progression.json").read_text())
SAFETY = json.loads((KB / "safety.json").read_text())

app = FastAPI(title="Muscle Up API")
DISCLAIMER = "This is general information, not medical advice. Consult a doctor or registered dietitian before changing your diet."


@app.get("/healthz")
@app.get("/api/v1/health")
def health():
    return {"status": "ok"}


def get_model(user_key: Optional[str], as_json: bool = True):
    key = user_key or os.getenv("GEMINI_API_KEY")
    if not key:
        raise HTTPException(401, "Provide X-Gemini-Key or sign in.")
    genai.configure(api_key=key)
    cfg = {"response_mime_type": "application/json"} if as_json else {}
    return genai.GenerativeModel("gemini-1.5-flash", generation_config=cfg)


class Profile(BaseModel):
    fitness_level: str = Field(min_length=1, max_length=50)
    primary_goal: str = Field(min_length=1, max_length=80)
    equipment: list[str] = Field(default_factory=list)
    joint_constraints: list[str] = Field(default_factory=list)
    days_per_week: int = Field(default=3, ge=1, le=7)


class DietReq(BaseModel):
    age: int = Field(ge=1, le=120)
    gender: str = Field(default="unspecified", max_length=40)
    height_cm: float = Field(gt=0, le=300)
    weight_kg: float = Field(gt=0, le=700)
    target_weight_kg: float = Field(gt=0, le=700)
    tdee: float = Field(gt=0, le=15000)
    weekly_budget: float = Field(ge=0, le=100000)
    pantry: list[str] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)


class ChatReq(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    recent_workouts: list[dict] = Field(default_factory=list)


def allowed_exercises(p: Profile):
    gear = set(p.equipment) | {"bodyweight"}
    banned = {n for j in p.joint_constraints for n in SAFETY["contraindications"].get(j, {}).get("avoid", [])}
    return [e for e in LIBRARY if set(e["equipment"]) <= gear and e["name"] not in banned]


@app.post("/api/v1/generate-plan")
def generate_plan(p: Profile, x_gemini_key: Optional[str] = Header(None)):
    pool = allowed_exercises(p)
    if not pool:
        raise HTTPException(422, "No exercises match the equipment and joint constraints.")
    prompt = (f"Create a {p.days_per_week}-day workout plan as JSON with keys days[{{title, exercises[{{name, muscle, sets, rep_range}}]}}]. "
              f"Use ONLY these exercises: {json.dumps(pool)}. Progression rules: {json.dumps(RULES)}. "
              f"Level: {p.fitness_level}. Goal: {p.primary_goal}.")
    return json.loads(get_model(x_gemini_key).generate_content(prompt).text)


@app.post("/api/v1/generate-diet")
def generate_diet(d: DietReq, x_gemini_key: Optional[str] = Header(None)):
    bmi = d.weight_kg / (d.height_cm / 100) ** 2
    flags = []
    if d.age < SAFETY["diet_flags"]["min_age"]: flags.append("under_18")
    if bmi < SAFETY["diet_flags"]["min_bmi"] and d.target_weight_kg < d.weight_kg: flags.append("underweight_cutting")
    if d.conditions: flags.append("medical_conditions")
    if "under_18" in flags or "underweight_cutting" in flags:
        return {"plan": None, "safety_flags": flags, "disclaimer": DISCLAIMER,
                "message": "A calorie-deficit plan is not appropriate here. Please speak with a doctor or dietitian."}
    prompt = (f"Create a 7-day macro-balanced meal framework as JSON. Daily calories near {d.tdee:.0f}, adjusted toward the target weight. "
              f"Weekly budget: {d.weekly_budget}. Build around these pantry staples: {d.pantry}. Conditions to respect: {d.conditions}.")
    plan = json.loads(get_model(x_gemini_key).generate_content(prompt).text)
    return {"plan": plan, "safety_flags": flags, "disclaimer": DISCLAIMER}


@app.post("/api/v1/chat")
def chat(c: ChatReq, x_gemini_key: Optional[str] = Header(None)):
    prompt = (f"You are a fitness coach. Recent training: {json.dumps(c.recent_workouts[-5:])}. "
              f"Rules: {json.dumps(RULES)}. Answer briefly. Question: {c.message}")
    return {"reply": get_model(x_gemini_key, as_json=False).generate_content(prompt).text}
