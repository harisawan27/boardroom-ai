import asyncio
from database import engine
from sqlalchemy import text

async def run_migration():
    async with engine.begin() as conn:
        print("Running migration to add profile_data to users table...")
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN profile_data JSONB;"))
            print("Migration successful: Added profile_data column.")
        except Exception as e:
            if "already exists" in str(e):
                print("Migration skipped: Column profile_data already exists.")
            else:
                print(f"Migration failed: {e}")

if __name__ == "__main__":
    asyncio.run(run_migration())
