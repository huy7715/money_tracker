import sqlite3
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import sys

# Add parent directory to path to import models if needed
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def migrate():
    sqlite_path = 'money_tracker.db'
    pg_url = os.environ.get('DATABASE_URL')
    
    if not pg_url:
        print("Error: DATABASE_URL environment variable not set.")
        return

    print(f"Connecting to SQLite: {sqlite_path}")
    s_conn = sqlite3.connect(sqlite_path)
    s_conn.row_factory = sqlite3.Row
    s_cur = s_conn.cursor()

    print(f"Connecting to PostgreSQL...")
    p_conn = psycopg2.connect(pg_url)
    p_cur = p_conn.cursor()

    tables = ['assets', 'transactions', 'budgets', 'diary', 'financial_goals']
    
    try:
        for table in tables:
            print(f"Migrating table: {table}...")
            
            # Get data from SQLite
            s_cur.execute(f"SELECT * FROM {table}")
            rows = s_cur.fetchall()
            
            if not rows:
                print(f"  No data in {table}, skipping.")
                continue

            # Prepare PG insert
            columns = rows[0].keys()
            placeholders = ", ".join(["%s"] * len(columns))
            col_names = ", ".join(columns)
            
            # Clear target table in PG first? (Optional - maybe safer to just Append)
            # p_cur.execute(f"DELETE FROM {table}")
            
            insert_query = f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
            
            data_to_insert = [tuple(row) for row in rows]
            p_cur.executemany(insert_query, data_to_insert)
            
            print(f"  Successfully migrated {len(rows)} rows to {table}.")

        p_conn.commit()
        print("\nMigration completed successfully!")
        print("Your local SQLite data is safe and has been copied to the cloud database.")

    except Exception as e:
        p_conn.rollback()
        print(f"\nError during migration: {e}")
    finally:
        s_conn.close()
        p_conn.close()

if __name__ == "__main__":
    migrate()
