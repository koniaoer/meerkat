from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# Database URL - support PostgreSQL and SQLite
DATABASE_URL = os.environ.get("DATABASE_URL", "")

if not DATABASE_URL:
    # Fallback to SQLite for development
    if os.path.exists("/app/data"):
        DATA_DIR = "/app/data"
    else:
        DATA_DIR = os.path.join(os.getcwd(), "data")
    
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)
    
    DATABASE_URL = f"sqlite:///{os.path.join(DATA_DIR, 'meerkat.db')}"

# SQLite requires check_same_thread=False
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
