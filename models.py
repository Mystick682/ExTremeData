# models.py
from sqlalchemy import Column, Integer, String, Float, Numeric
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False) # This will store the email
    
    # --- NEW COLUMNS ---
    hashed_password = Column(String, nullable=False)
    first_name = Column(String)
    last_name = Column(String)

    # Using Numeric is better for money
    balance = Column(Numeric(10, 2), nullable=False, default=0.00)