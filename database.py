# database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# Define your Database URL
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

# Create the SQLAlchemy engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# Create a SessionLocal class (the session factory)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create a Base class for your ORM models to inherit from
Base = declarative_base()