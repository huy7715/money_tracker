import sqlite3
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from .models import Transaction, Budget

class Storage:
    def __init__(self, db_path='money_tracker.db'):
        self.db_path = db_path
        self.pg_url = os.environ.get('DATABASE_URL')
        self.is_postgres = self.pg_url is not None
        
        if self.is_postgres:
            print(f"Storage: Initializing with PostgreSQL (Cloud)")
        else:
            print(f"Storage: Initializing with SQLite (Local: {self.db_path})")
            
        self.init_db()

    @contextmanager
    def _conn(self):
        if self.is_postgres:
            conn = psycopg2.connect(self.pg_url)
            try:
                yield conn
            finally:
                conn.close()
        else:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            try:
                yield conn
            finally:
                conn.close()

    def get_cursor(self, conn):
        if self.is_postgres:
            return conn.cursor(cursor_factory=RealDictCursor)
        else:
            return conn.cursor()



    def init_db(self):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            
            # Setup SERIAL/AUTOINCREMENT and dialect-specific types
            id_type = "SERIAL PRIMARY KEY" if self.is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"
            text_type = "TEXT"
            real_type = "REAL"
            
            cursor.execute(f'''
                CREATE TABLE IF NOT EXISTS transactions (
                    id {id_type},
                    amount {real_type} NOT NULL,
                    category {text_type} NOT NULL,
                    type {text_type} NOT NULL,
                    description {text_type},
                    date {text_type} NOT NULL,
                    asset_id INTEGER
                )
            ''')
            
            # Column addition handling (generic)
            if self.is_postgres:
                # In PG, we check if column exists first
                cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='transactions' AND column_name='asset_id'")
                if not cursor.fetchone():
                    cursor.execute("ALTER TABLE transactions ADD COLUMN asset_id INTEGER")
            else:
                try:
                    cursor.execute("ALTER TABLE transactions ADD COLUMN asset_id INTEGER")
                except sqlite3.OperationalError:
                    pass

            cursor.execute(f'''
                CREATE TABLE IF NOT EXISTS budgets (
                    id {id_type},
                    category {text_type} NOT NULL,
                    monthly_limit {real_type} NOT NULL,
                    month {text_type} NOT NULL,
                    UNIQUE(category, month)
                )
            ''')
            
            cursor.execute(f'''
                CREATE TABLE IF NOT EXISTS diary (
                    id {id_type},
                    date {text_type} UNIQUE NOT NULL,
                    content {text_type} NOT NULL,
                    title {text_type}
                )
            ''')
            
            if self.is_postgres:
                cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='diary' AND column_name='title'")
                if not cursor.fetchone():
                    cursor.execute("ALTER TABLE diary ADD COLUMN title TEXT")
            else:
                try:
                    cursor.execute("ALTER TABLE diary ADD COLUMN title TEXT")
                except sqlite3.OperationalError:
                    pass
            
            cursor.execute(f'''
                CREATE TABLE IF NOT EXISTS assets (
                    id {id_type},
                    name {text_type} UNIQUE NOT NULL,
                    type {text_type} NOT NULL,
                    amount {real_type} NOT NULL,
                    interest_rate {real_type} DEFAULT 0,
                    term_months INTEGER DEFAULT 0,
                    start_date {text_type},
                    end_date {text_type},
                    auto_contribution {real_type} DEFAULT 0,
                    last_updated_month {text_type}
                )
            ''')

            # Seed initial assets (Only if empty)
            cursor.execute("SELECT count(*) FROM assets")
            count = cursor.fetchone()
            count_val = count['count'] if self.is_postgres else count[0]
            
            if count_val == 0:
                # Cash: 4.000.000
                cursor.execute("INSERT INTO assets (name, type, amount) VALUES (%s, %s, %s)" if self.is_postgres else "INSERT INTO assets (name, type, amount) VALUES (?, ?, ?)", ("Cash", "Cash", 4000000))
                
                # Bank: 22.000.000
                cursor.execute("INSERT INTO assets (name, type, amount) VALUES (%s, %s, %s)" if self.is_postgres else "INSERT INTO assets (name, type, amount) VALUES (?, ?, ?)", ("Bank Account", "Bank", 22000000))
                
                # Savings 1: 90m, 3.5%, ends 16/06/2026
                cursor.execute("INSERT INTO assets (name, type, amount, interest_rate, end_date) VALUES (%s, %s, %s, %s, %s)" if self.is_postgres else "INSERT INTO assets (name, type, amount, interest_rate, end_date) VALUES (?, ?, ?, ?, ?)", 
                               ("Long Term Savings", "Savings", 90000000, 3.5, "2026-06-16"))
                
                # Savings 2: 12.5m, 5.2%, ends 29/01/2027
                cursor.execute("INSERT INTO assets (name, type, amount, interest_rate, end_date, start_date) VALUES (%s, %s, %s, %s, %s, %s)" if self.is_postgres else "INSERT INTO assets (name, type, amount, interest_rate, end_date, start_date) VALUES (?, ?, ?, ?, ?, ?)", 
                               ("Savings Book 1", "Savings", 12500000, 5.2, "2027-01-29", "2024-01-29"))
                
                # Savings 3: 12.5m, 5.2%, ends 29/01/2027
                cursor.execute("INSERT INTO assets (name, type, amount, interest_rate, end_date, start_date) VALUES (?, ?, ?, ?, ?, ?)", 
                               ("Savings Book 2", "Savings", 12500000, 5.2, "2027-01-29", "2024-01-29"))
                               
                # Cumulative Fund: 3m initial, 2m monthly, 5.2%, ends 29/01/2027
                # Created "yesterday" (2026-01-29 presumably based on user context, or simply Jan 2026)
                # Auto-contribution set to 2,000,000
                # last_updated_month set to '2026-01' so it doesn't trigger again for this Jan.
                cursor.execute('''
                    INSERT INTO assets (name, type, amount, interest_rate, end_date, start_date, auto_contribution, last_updated_month)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', ("Cumulative Fund", "Cumulative", 3000000, 5.2, "2027-01-29", "2026-01-29", 2000000, "2026-01"))
            
            # Financial Goals Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS financial_goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    target_amount REAL,
                    current_amount REAL DEFAULT 0,
                    goal_type TEXT NOT NULL,
                    year INTEGER NOT NULL,
                    icon TEXT DEFAULT '🎯',
                    color TEXT DEFAULT '#6366f1',
                    is_completed INTEGER DEFAULT 0,
                    notes TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT
                )
            ''')
            # Add notes column if it doesn't exist
            try:
                cursor.execute("ALTER TABLE financial_goals ADD COLUMN notes TEXT")
            except sqlite3.OperationalError:
                pass # Column already exists

            # Performance Indexes
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_asset ON transactions(asset_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_diary_date ON diary(date)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_goals_year ON financial_goals(year)")
            
            conn.commit()

    def add_transaction(self, transaction: Transaction):
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO transactions (amount, category, type, description, date, asset_id)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (transaction.amount, transaction.category, transaction.type, transaction.description, transaction.date, transaction.asset_id))
            transaction.id = cursor.lastrowid
            conn.commit()
            return transaction

    def get_transactions(self):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            cursor.execute('SELECT * FROM transactions ORDER BY date DESC')
            rows = cursor.fetchall()
            transactions = []
            for row in rows:
                transactions.append(Transaction(
                    id=row['id'],
                    amount=row['amount'],
                    category=row['category'],
                    type=row['type'],
                    description=row['description'],
                    date=row['date'],
                    asset_id=row['asset_id']
                ))
            return transactions

    def get_balance(self, month=None):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            
            # Pattern matching: Postgres LIKE '%', SQLite LIKE '%'
            # date LIKE 'YYYY-MM%'
            
            income_query = "SELECT SUM(amount) FROM transactions WHERE type='income'"
            expense_query = "SELECT SUM(amount) FROM transactions WHERE type='expense'"
            params = []
            
            if month:
                # Use standard SQL LIKE with pattern
                income_query += f" AND date LIKE {placeholder} || '%'"
                expense_query += f" AND date LIKE {placeholder} || '%'"
                params.append(month)
                
            cursor.execute(income_query, params)
            res = cursor.fetchone()
            income = (res['sum'] if self.is_postgres else res[0]) if res and (res['sum'] if self.is_postgres else res[0]) is not None else 0.0
            
            cursor.execute(expense_query, params)
            res = cursor.fetchone()
            expense = (res['sum'] if self.is_postgres else res[0]) if res and (res['sum'] if self.is_postgres else res[0]) is not None else 0.0
            
            return income - expense

    def get_all_time_stats(self):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            cursor.execute("SELECT SUM(amount) FROM transactions WHERE type='income'")
            res_income = cursor.fetchone()
            income = (res_income['sum'] if self.is_postgres else res_income[0]) if res_income and (res_income['sum'] if self.is_postgres else res_income[0]) is not None else 0.0
            
            cursor.execute("SELECT SUM(amount) FROM transactions WHERE type='expense'")
            res_expense = cursor.fetchone()
            expense = (res_expense['sum'] if self.is_postgres else res_expense[0]) if res_expense and (res_expense['sum'] if self.is_postgres else res_expense[0]) is not None else 0.0
            
            return {"income": income, "expense": expense}

    def get_transaction(self, transaction_id):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(f'SELECT * FROM transactions WHERE id = {placeholder}', (transaction_id,))
            row = cursor.fetchone()
            if row:
                return Transaction(
                    id=row['id'],
                    amount=row['amount'],
                    category=row['category'],
                    type=row['type'],
                    description=row['description'],
                    date=row['date'],
                    asset_id=row['asset_id']
                )
            return None

    def delete_transaction(self, transaction_id):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(f"DELETE FROM transactions WHERE id = {placeholder}", (transaction_id,))
            conn.commit()
            return True

    def update_transaction(self, transaction_id, amount, category, type, description, date):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(f'''
                UPDATE transactions
                SET amount = {placeholder}, category = {placeholder}, type = {placeholder}, description = {placeholder}, date = {placeholder}
                WHERE id = {placeholder}
            ''', (amount, category, type, description, date, transaction_id))
            conn.commit()
            return True

    # Budget methods
    def add_budget(self, budget: Budget):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            try:
                cursor.execute(f'''
                    INSERT INTO budgets (category, monthly_limit, month)
                    VALUES ({placeholder}, {placeholder}, {placeholder})
                ''', (budget.category, budget.monthly_limit, budget.month))
                if self.is_postgres:
                    cursor.execute("SELECT currval(pg_get_serial_sequence('budgets','id'))")
                    budget.id = cursor.fetchone()['currval']
                else:
                    budget.id = cursor.lastrowid
                conn.commit()
            except (sqlite3.IntegrityError, psycopg2.IntegrityError if self.is_postgres else Exception):
                # Budget already exists for this category/month, update it
                conn.rollback() # Important for PG
                cursor.execute(f'''
                    UPDATE budgets
                    SET monthly_limit = {placeholder}
                    WHERE category = {placeholder} AND month = {placeholder}
                ''', (budget.monthly_limit, budget.category, budget.month))
                conn.commit()
            return budget

    def get_budgets(self, month=None):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            if month:
                cursor.execute(f'SELECT * FROM budgets WHERE month = {placeholder}', (month,))
            else:
                cursor.execute('SELECT * FROM budgets')
            rows = cursor.fetchall()
            budgets = []
            for row in rows:
                budgets.append(Budget(
                    id=row['id'],
                    category=row['category'],
                    monthly_limit=row['monthly_limit'],
                    month=row['month']
                ))
            return budgets

    def delete_budget(self, category, month):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(f"DELETE FROM budgets WHERE category = {placeholder} AND month = {placeholder}", (category, month))
            conn.commit()
            return True

    # Reporting methods
    def get_spending_by_category(self, month):
        """Get total spending per category for a specific month (YYYY-MM)"""
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(f'''
                SELECT category, SUM(amount) as total
                FROM transactions
                WHERE type = 'expense' AND date LIKE {placeholder} || '%'
                GROUP BY category
            ''', (month,))
            rows = cursor.fetchall()
            return {row['category']: row['total'] if not self.is_postgres else float(row['total']) for row in rows}

    def get_monthly_summary(self, month):
        """Get income, expense, and transaction count for a specific month"""
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            
            cursor.execute(f'''
                SELECT SUM(amount) as total
                FROM transactions
                WHERE type = 'income' AND date LIKE {placeholder} || '%'
            ''', (month,))
            res = cursor.fetchone()
            income = (res['total'] if self.is_postgres else res['total']) or 0.0 # Row dict key is predictable if named
            if self.is_postgres: income = float(income)
            
            cursor.execute(f'''
                SELECT SUM(amount) as total
                FROM transactions
                WHERE type = 'expense' AND date LIKE {placeholder} || '%'
            ''', (month,))
            res = cursor.fetchone()
            expense = (res['total'] if self.is_postgres else res['total']) or 0.0
            if self.is_postgres: expense = float(expense)
            
            cursor.execute(f'''
                SELECT COUNT(*) as count
                FROM transactions
                WHERE date LIKE {placeholder} || '%'
            ''', (month,))
            res = cursor.fetchone()
            count = res['count'] if self.is_postgres else res['count']
            
            return {
                'income': income,
                'expense': expense,
                'net': income - expense,
                'count': count
            }

    def get_transactions_by_month(self, month):
        """Get all transactions for a specific month"""
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(f'''
                SELECT * FROM transactions
                WHERE date LIKE {placeholder} || '%'
                ORDER BY date DESC
            ''', (month,))
            rows = cursor.fetchall()
            transactions = []
            for row in rows:
                transactions.append(Transaction(
                    id=row['id'],
                    amount=row['amount'],
                    category=row['category'],
                    type=row['type'],
                    description=row['description'],
                    date=row['date'],
                    asset_id=row['asset_id']
                ))
            return transactions

    # Diary methods
    def save_diary(self, date, content, title=None):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            
            # Helper to check if content is effectively empty (handling basic HTML/whitespace)
            def is_effectively_empty(text):
                if not text:
                    return True
                # Remove common empty HTML tags and whitespace
                clean = text.replace('<br>', '').replace('<div>', '').replace('</div>', '').replace('&nbsp;', '').replace('<p>', '').replace('</p>', '').strip()
                return len(clean) == 0

            is_content_empty = is_effectively_empty(content)
            is_title_empty = not title or not title.strip()
            
            if is_content_empty and is_title_empty:
                cursor.execute(f'DELETE FROM diary WHERE date = {placeholder}', (date,))
            else:
                try:
                    cursor.execute(f'''
                        INSERT INTO diary (date, content, title)
                        VALUES ({placeholder}, {placeholder}, {placeholder})
                    ''', (date, content, title))
                except (sqlite3.IntegrityError, psycopg2.IntegrityError if self.is_postgres else Exception):
                    if self.is_postgres: conn.rollback()
                    cursor.execute(f'''
                        UPDATE diary
                        SET content = {placeholder}, title = {placeholder}
                        WHERE date = {placeholder}
                    ''', (content, title, date))
            
            conn.commit()
            return True

    def get_diary(self, date):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(f'SELECT content, title FROM diary WHERE date = {placeholder}', (date,))
            row = cursor.fetchone()
            if row:
                return {"content": row['content'], "title": row['title']}
            return {"content": "", "title": ""}

    def get_diary_history(self):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            # Standard dialect for trim and string functions
            cursor.execute('''
                SELECT date, title, content FROM diary 
                WHERE (title IS NOT NULL AND btrim(title) != '') 
                   OR (content IS NOT NULL AND btrim(content) != '')
                ORDER BY date DESC
            ''' if self.is_postgres else '''
                SELECT date, title, content FROM diary 
                WHERE (title IS NOT NULL AND trim(title) != '') 
                   OR (content IS NOT NULL AND trim(content) != '')
                ORDER BY date DESC
            ''')
            rows = cursor.fetchall()
            
            def is_effectively_empty(text):
                if not text: return True
                clean = text.replace('<br>', '').replace('<div>', '').replace('</div>', '').replace('&nbsp;', '').replace('<p>', '').replace('</p>', '').strip()
                return len(clean) == 0

            history = []
            for row in rows:
                if not is_effectively_empty(row['content']) or (row['title'] and row['title'].strip()):
                    history.append({"date": row['date'], "title": row['title']})
            return history

    def get_assets(self):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            cursor.execute("SELECT * FROM assets")
            rows = cursor.fetchall()
            assets = []
            for row in rows:
                assets.append({
                    "id": row["id"],
                    "name": row["name"],
                    "type": row["type"],
                    "amount": row["amount"],
                    "interest_rate": row["interest_rate"],
                    "term_months": row["term_months"],
                    "start_date": row["start_date"],
                    "end_date": row["end_date"],
                    "auto_contribution": row["auto_contribution"],
                    "last_updated_month": row["last_updated_month"]
                })
            return assets
    
    def get_asset_balance_adjustment_after(self, asset_id, month):
        """
        Calculate total changes to an asset after the specified month (YYYY-MM).
        Returns SUM(income_amount) - SUM(expense_amount) for transactions > last day of month.
        """
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            
            # We want transactions happening AFTER this month.
            # SQLite comparison: '2026-02' > '2026-01' works.
            # But '2026-01-15' starts with '2026-01'.
            # We want anything where date >= 'YYYY-(MM+1)-01'
            # Easier: date NOT LIKE 'YYYY-MM%' AND date > 'YYYY-MM'
            
            date_part = "substring(date from 1 for 7)" if self.is_postgres else "substr(date, 1, 7)"
            
            cursor.execute(f'''
                SELECT type, SUM(amount) as total
                FROM transactions
                WHERE asset_id = {placeholder} AND {date_part} > {placeholder}
                GROUP BY type
            ''', (asset_id, month))
            
            rows = cursor.fetchall()
            
            adjustment = 0.0
            for row in rows:
                if row['type'] == 'income':
                    adjustment += (row['total'] if not self.is_postgres else float(row['total']))
                else: # expense
                    adjustment -= (row['total'] if not self.is_postgres else float(row['total']))
            return adjustment
    
    def add_asset(self, name, type, amount, interest_rate=0, term_months=0, start_date=None, end_date=None, auto_contribution=0, last_updated_month=None):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            try:
                cursor.execute(f'''
                    INSERT INTO assets (name, type, amount, interest_rate, term_months, start_date, end_date, auto_contribution, last_updated_month)
                    VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
                ''', (name, type, amount, interest_rate, term_months, start_date, end_date, auto_contribution, last_updated_month))
                if self.is_postgres:
                    cursor.execute("SELECT currval(pg_get_serial_sequence('assets','id'))")
                    new_id = cursor.fetchone()['currval']
                else:
                    new_id = cursor.lastrowid
                conn.commit()
                return new_id
            except (sqlite3.IntegrityError, psycopg2.IntegrityError if self.is_postgres else Exception):
                return None

    def update_asset(self, asset_id, name, type, amount, interest_rate, term_months, start_date, end_date, auto_contribution, last_updated_month):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            try:
                cursor.execute(f'''
                    UPDATE assets 
                    SET name = {placeholder}, type = {placeholder}, amount = {placeholder}, interest_rate = {placeholder}, term_months = {placeholder}, start_date = {placeholder}, end_date = {placeholder}, auto_contribution = {placeholder}, last_updated_month = {placeholder}
                    WHERE id = {placeholder}
                ''', (name, type, amount, interest_rate, term_months, start_date, end_date, auto_contribution, last_updated_month, asset_id))
                conn.commit()
                return True
            except (sqlite3.IntegrityError, psycopg2.IntegrityError if self.is_postgres else Exception):
                return False

    def delete_asset(self, asset_id):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            # First, decouple transactions from this asset
            cursor.execute(f"UPDATE transactions SET asset_id = NULL WHERE asset_id = {placeholder}", (asset_id,))
            # Then delete the asset
            cursor.execute(f"DELETE FROM assets WHERE id = {placeholder}", (asset_id,))
            conn.commit()
            return True

    def update_asset_balance(self, asset_id, new_amount, last_updated_month=None):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            if last_updated_month:
                cursor.execute(f"UPDATE assets SET amount = {placeholder}, last_updated_month = {placeholder} WHERE id = {placeholder}", (new_amount, last_updated_month, asset_id))
            else:
                cursor.execute(f"UPDATE assets SET amount = {placeholder} WHERE id = {placeholder}", (new_amount, asset_id))
            conn.commit()

    def get_available_months(self):
        """Returns a list of unique months (YYYY-MM) that have transactions"""
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            # Extract YYYY-MM from date strings like 'YYYY-MM-DD HH:MM:SS'
            date_part = "substring(date from 1 for 7)" if self.is_postgres else "substr(date, 1, 7)"
            cursor.execute(f"SELECT DISTINCT {date_part} as month FROM transactions ORDER BY month DESC")
            months = [row['month'] for row in cursor.fetchall() if row['month']]
            return months

    # ========== Financial Goals Methods ==========
    def add_goal(self, title, target_amount, goal_type, year, icon='🎯', color='#6366f1', notes=None):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            from datetime import datetime
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute(f'''
                INSERT INTO financial_goals (title, target_amount, current_amount, goal_type, year, icon, color, is_completed, notes, created_at, updated_at)
                VALUES ({placeholder}, {placeholder}, 0, {placeholder}, {placeholder}, {placeholder}, {placeholder}, 0, {placeholder}, {placeholder}, {placeholder})
            ''', (title, target_amount, goal_type, year, icon, color, notes, now, now))
            if self.is_postgres:
                cursor.execute("SELECT currval(pg_get_serial_sequence('financial_goals','id'))")
                new_id = cursor.fetchone()['currval']
            else:
                new_id = cursor.lastrowid
            conn.commit()
            return new_id

    def get_goals(self, year):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(f'SELECT * FROM financial_goals WHERE year = {placeholder} ORDER BY created_at ASC', (year,))
            rows = cursor.fetchall()
            goals = []
            for row in rows:
                goals.append({
                    'id': row['id'],
                    'title': row['title'],
                    'target_amount': row['target_amount'],
                    'current_amount': row['current_amount'],
                    'goal_type': row['goal_type'],
                    'year': row['year'],
                    'icon': row['icon'],
                    'color': row['color'],
                    'is_completed': bool(row['is_completed']),
                    'notes': row['notes'],
                    'created_at': row['created_at'],
                    'updated_at': row['updated_at']
                })
            return goals

    def update_goal(self, goal_id, title=None, target_amount=None, current_amount=None, goal_type=None, icon=None, color=None, notes=None):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            from datetime import datetime
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            # Build dynamic update
            fields = []
            values = []
            if title is not None:
                fields.append('title = %s' if self.is_postgres else 'title = ?')
                values.append(title)
            if target_amount is not None:
                fields.append('target_amount = %s' if self.is_postgres else 'target_amount = ?')
                values.append(target_amount)
            if current_amount is not None:
                fields.append('current_amount = %s' if self.is_postgres else 'current_amount = ?')
                values.append(current_amount)
            if goal_type is not None:
                fields.append('goal_type = %s' if self.is_postgres else 'goal_type = ?')
                values.append(goal_type)
            if icon is not None:
                fields.append('icon = %s' if self.is_postgres else 'icon = ?')
                values.append(icon)
            if color is not None:
                fields.append('color = %s' if self.is_postgres else 'color = ?')
                values.append(color)
            if notes is not None:
                fields.append('notes = %s' if self.is_postgres else 'notes = ?')
                values.append(notes)
            fields.append('updated_at = %s' if self.is_postgres else 'updated_at = ?')
            values.append(now)
            values.append(goal_id)
            query = f"UPDATE financial_goals SET {', '.join(fields)} WHERE id = {placeholder}"
            cursor.execute(query, values)
            conn.commit()
            return cursor.rowcount > 0

    def delete_goal(self, goal_id):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            cursor.execute(f'DELETE FROM financial_goals WHERE id = {placeholder}', (goal_id,))
            conn.commit()
            return cursor.rowcount > 0

    def update_goal_progress(self, goal_id, current_amount):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            from datetime import datetime
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute(f'''
                UPDATE financial_goals SET current_amount = {placeholder}, updated_at = {placeholder} WHERE id = {placeholder}
            ''', (current_amount, now, goal_id))
            conn.commit()
            return cursor.rowcount > 0

    def toggle_goal_completed(self, goal_id):
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            from datetime import datetime
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute(f'''
                UPDATE financial_goals SET is_completed = CASE WHEN is_completed = 0 THEN 1 ELSE 0 END, updated_at = {placeholder} WHERE id = {placeholder}
            ''', (now, goal_id))
            conn.commit()
            # Return the new state
            cursor.execute(f'SELECT is_completed FROM financial_goals WHERE id = {placeholder}', (goal_id,))
            row = cursor.fetchone()
            return bool(row['is_completed']) if row else None
    def get_goal_calculation(self, goal_type, year):
        """Calculate current amount for a goal type based on actual transactions/budgets."""
        with self._conn() as conn:
            cursor = self.get_cursor(conn)
            placeholder = "%s" if self.is_postgres else "?"
            
            if goal_type == 'savings':
                # Sum CURRENT balances from Cash and Bank assets
                # These are the "Current Amount" for savings goals
                cursor.execute("SELECT SUM(amount) as total FROM assets WHERE type IN ('Cash', 'Bank')")
                res = cursor.fetchone()
                val = res['total'] if self.is_postgres else res['total']
                return float(val) if val is not None else 0.0
            
            elif goal_type == 'income':
                # Sum of all income transactions for the year
                # Note: PG date column is text in my schema, so cast and convert. 
                # Simpler: date LIKE 'YYYY%'
                cursor.execute(f"SELECT SUM(amount) as total FROM transactions WHERE type = 'income' AND date LIKE {placeholder} || '%%'", (str(year),))
                res = cursor.fetchone()
                val = res['total'] if self.is_postgres else res['total']
                return float(val) if val is not None else 0.0
            
            elif goal_type == 'expense_limit':
                # Sum of all expense transactions for the year
                cursor.execute(f"SELECT SUM(amount) as total FROM transactions WHERE type = 'expense' AND date LIKE {placeholder} || '%%'", (str(year),))
                res = cursor.fetchone()
                val = res['total'] if self.is_postgres else res['total']
                return float(val) if val is not None else 0.0
            
            return None # Use stored current_amount for custom/others
