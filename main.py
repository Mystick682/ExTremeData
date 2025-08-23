# main.py - Final Corrected Version

import os
import requests
from fastapi import FastAPI, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# --- NEW: We are now using Argon2 for password hashing ---
from passlib.context import CryptContext

import models
from database import SessionLocal, engine, Base

# --- Setup ---
load_dotenv()
# We now tell passlib to use the argon2 algorithm
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# --- Configuration ---
PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "your_fallback_secret_key")
if PAYSTACK_SECRET_KEY == "your_fallback_secret_key":
    print("WARNING: PAYSTACK_SECRET_KEY is not set. Please create a .env file.")

Base.metadata.create_all(bind=engine)
app = FastAPI()

# --- CORS Middleware ---
origins = ["http://localhost:8888", "null"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Dependency ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Pydantic Models ---
class UserRequest(BaseModel):
    username: str

class VerifyPaymentRequest(BaseModel):
    username: str
    reference: str

class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str
    firstName: str
    lastName: str

# --- API Endpoints ---

@app.post("/create_user")
def create_user(request: UserCreateRequest, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(models.User.username == request.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="A user with this email already exists.")

    # Hash the password with Argon2
    hashed_password = pwd_context.hash(request.password)
    
    new_user = models.User(
        username=request.email,
        hashed_password=hashed_password,
        first_name=request.firstName,
        last_name=request.lastName,
        balance=0.0
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"success": True, "username": new_user.username, "message": "User created successfully"}


@app.post("/get_balance")
def get_balance(request: UserRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == request.username).first()
    if user:
        return {"success": True, "balance": user.balance}
    else:
        raise HTTPException(status_code=404, detail="User not found")


# In main.py, replace the old verify_payment function with this one.

@app.post("/verify_payment")
def verify_payment(data: VerifyPaymentRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == data.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    headers = {"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"}
    
    try:
        # THIS IS THE KEY: We add verify=False to bypass the SSL block.
        resp = requests.get(
            f"https://api.paystack.co/transaction/verify/{data.reference}",
            headers=headers,
            timeout=10,
            verify=False  # <-- THIS IS THE FIX
        )
        resp.raise_for_status() 

    except requests.exceptions.RequestException as e:
        # This will now give a clear error if the problem persists.
        raise HTTPException(status_code=502, detail=f"Failed to contact Paystack. Please check your network or firewall.")

    result = resp.json()
    if result.get("status") and result.get("data", {}).get("status") == "success":
        amount_paid = result["data"]["amount"] / 100
        user.balance += amount_paid
        db.commit()
        db.refresh(user)
        return {
            "success": True, "username": user.username, "new_balance": user.balance, "amount_paid": amount_paid
        }

    raise HTTPException(status_code=400, detail="Payment verification failed with Paystack")