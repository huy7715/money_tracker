import sqlite3
import os
from contextlib import contextmanager
from .models import Transaction, Budget

class Storage:
    def __init__(self, db_path='money_tracker.db'):
        self.db_path = db_path
        self.init_db()

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()



    def init_db(self):
        with self._conn() as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    amount REAL NOT NULL,
                    category TEXT NOT NULL,
                    type TEXT NOT NULL,
                    description TEXT,
                    date TEXT NOT NULL,
                    asset_id INTEGER
                )
            ''')
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS budgets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category TEXT NOT NULL,
                    monthly_limit REAL NOT NULL,
                    month TEXT NOT NULL,
                    UNIQUE(category, month)
                )
            ''')
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS diary (
                    date TEXT PRIMARY KEY,
                    content TEXT,
                    title TEXT
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS assets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    type TEXT NOT NULL,
                    amount REAL DEFAULT 0,
                    interest_rate REAL DEFAULT 0,
                    term_months INTEGER DEFAULT 0,
                    start_date TEXT,
                    end_date TEXT,
                    auto_contribution REAL DEFAULT 0,
                    last_updated_month TEXT
                )
            ''')

            # Financial Goals table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS financial_goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    target_amount REAL NOT NULL,
                    current_amount REAL DEFAULT 0,
                    goal_type TEXT NOT NULL,
                    year INTEGER NOT NULL,
                    icon TEXT DEFAULT '🎯',
                    color TEXT DEFAULT '#6366f1',
                    is_completed INTEGER DEFAULT 0,
                    notes TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
            ''')

            # Migrations: Add asset_id to transactions if missing
            cursor.execute("PRAGMA table_info(transactions)")
            columns = [col[1] for col in cursor.fetchall()]
            if 'asset_id' not in columns:
                cursor.execute("ALTER TABLE transactions ADD COLUMN asset_id INTEGER")
                
            # Seed initial assets (Only if empty)
            cursor.execute("SELECT count(*) FROM assets")
            count = cursor.fetchone()
            if count[0] == 0:
                # Cash: 4.000.000
                cursor.execute("INSERT INTO assets (name, type, amount) VALUES (?, ?, ?)", ("Cash", "Cash", 4000000))
                # Bank: 22.000.000
                cursor.execute("INSERT INTO assets (name, type, amount) VALUES (?, ?, ?)", ("Bank Account", "Bank", 22000000))
                # Savings 1: 90m, 3.5%, ends 16/06/2026
                cursor.execute("INSERT INTO assets (name, type, amount, interest_rate, end_date) VALUES (?, ?, ?, ?, ?)", 
                               ("Long Term Savings", "Savings", 90000000, 3.5, "2026-06-16"))
                # Savings Book 1 & 2
                cursor.execute("INSERT INTO assets (name, type, amount, interest_rate, end_date, start_date) VALUES (?, ?, ?, ?, ?, ?)", 
                               ("Savings Book 1", "Savings", 12500000, 5.2, "2027-01-29", "2024-01-29"))
                cursor.execute("INSERT INTO assets (name, type, amount, interest_rate, end_date, start_date) VALUES (?, ?, ?, ?, ?, ?)", 
                               ("Savings Book 2", "Savings", 12500000, 5.2, "2027-01-29", "2024-01-29"))
                # Cumulative Fund
                cursor.execute('''
                    INSERT INTO assets (name, type, amount, interest_rate, end_date, start_date, auto_contribution, last_updated_month)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', ("Cumulative Fund", "Cumulative", 3000000, 5.2, "2027-01-29", "2026-01-29", 2000000, "2026-01"))

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
            cursor = conn.cursor()
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
            cursor = conn.cursor()
            income_query = "SELECT SUM(amount) FROM transactions WHERE type='income'"
            expense_query = "SELECT SUM(amount) FROM transactions WHERE type='expense'"
            params = []
            
            if month:
                income_query += " AND date LIKE ? || '%'"
                expense_query += " AND date LIKE ? || '%'"
                params.append(month)
                
            cursor.execute(income_query, params)
            res = cursor.fetchone()
            income = res[0] if res and res[0] is not None else 0.0
            
            cursor.execute(expense_query, params)
            res = cursor.fetchone()
            expense = res[0] if res and res[0] is not None else 0.0
            
            return income - expense

    def get_all_time_stats(self):
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT SUM(amount) FROM transactions WHERE type='income'")
            res_income = cursor.fetchone()
            income = res_income[0] if res_income and res_income[0] is not None else 0.0
            
            cursor.execute("SELECT SUM(amount) FROM transactions WHERE type='expense'")
            res_expense = cursor.fetchone()
            expense = res_expense[0] if res_expense and res_expense[0] is not None else 0.0
            
            return {"income": income, "expense": expense}

    def get_transaction(self, transaction_id):
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
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
            cursor = conn.cursor()
            cursor.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
            conn.commit()
            return True

    def update_transaction(self, transaction_id, amount, category, type, description, date):
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE transactions
                SET amount = ?, category = ?, type = ?, description = ?, date = ?
                WHERE id = ?
            ''', (amount, category, type, description, date, transaction_id))
            conn.commit()
            return True

    # Budget methods
    def add_budget(self, budget: Budget):
        with self._conn() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    INSERT INTO budgets (category, monthly_limit, month)
                    VALUES (?, ?, ?)
                ''', (budget.category, budget.monthly_limit, budget.month))
                budget.id = cursor.lastrowid
                conn.commit()
            except sqlite3.IntegrityError:
                # Budget already exists for this category/month, update it
                cursor.execute('''
                    UPDATE budgets
                    SET monthly_limit = ?
                    WHERE category = ? AND month = ?
                ''', (budget.monthly_limit, budget.category, budget.month))
                conn.commit()
            return budget

    def get_budgets(self, month=None):
        with self._conn() as conn:
            cursor = conn.cursor()
            if month:
                cursor.execute('SELECT * FROM budgets WHERE month = ?', (month,))
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
            cursor = conn.cursor()
            cursor.execute("DELETE FROM budgets WHERE category = ? AND month = ?", (category, month))
            conn.commit()
            return True

    # Reporting methods
    def get_spending_by_category(self, month):
        """Get total spending per category for a specific month (YYYY-MM)"""
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT category, SUM(amount) as total
                FROM transactions
                WHERE type = 'expense' AND date LIKE ? || '%'
                GROUP BY category
            ''', (month,))
            rows = cursor.fetchall()
            return {row['category']: row['total'] for row in rows}

    def get_monthly_summary(self, month):
        """Get income, expense, and transaction count for a specific month"""
        with self._conn() as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT SUM(amount) as total
                FROM transactions
                WHERE type = 'income' AND date LIKE ? || '%'
            ''', (month,))
            income = cursor.fetchone()['total'] or 0.0
            
            cursor.execute('''
                SELECT SUM(amount) as total
                FROM transactions
                WHERE type = 'expense' AND date LIKE ? || '%'
            ''', (month,))
            expense = cursor.fetchone()['total'] or 0.0
            
            cursor.execute('''
                SELECT COUNT(*) as count
                FROM transactions
                WHERE date LIKE ? || '%'
            ''', (month,))
            count = cursor.fetchone()['count']
            
            return {
                'income': income,
                'expense': expense,
                'net': income - expense,
                'count': count
            }

    def get_transactions_by_month(self, month):
        """Get all transactions for a specific month"""
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM transactions
                WHERE date LIKE ? || '%'
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
            cursor = conn.cursor()
            
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
                cursor.execute('DELETE FROM diary WHERE date = ?', (date,))
            else:
                try:
                    cursor.execute('''
                        INSERT INTO diary (date, content, title)
                        VALUES (?, ?, ?)
                    ''', (date, content, title))
                except sqlite3.IntegrityError:
                    cursor.execute('''
                        UPDATE diary
                        SET content = ?, title = ?
                        WHERE date = ?
                    ''', (content, title, date))
            
            conn.commit()
            return True

    def get_diary(self, date):
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT content, title FROM diary WHERE date = ?', (date,))
            row = cursor.fetchone()
            if row:
                return {"content": row['content'], "title": row['title']}
            return {"content": "", "title": ""}

    def get_diary_history(self):
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute('''
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
            cursor = conn.cursor()
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
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT type, SUM(amount) as total
                FROM transactions
                WHERE asset_id = ? AND substr(date, 1, 7) > ?
                GROUP BY type
            ''', (asset_id, month))
            
            rows = cursor.fetchall()
            
            adjustment = 0.0
            for row in rows:
                if row['type'] == 'income':
                    adjustment += row['total']
                else: # expense
                    adjustment -= row['total']
            return adjustment
    
    def add_asset(self, name, type, amount, interest_rate=0, term_months=0, start_date=None, end_date=None, auto_contribution=0, last_updated_month=None):
        with self._conn() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    INSERT INTO assets (name, type, amount, interest_rate, term_months, start_date, end_date, auto_contribution, last_updated_month)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (name, type, amount, interest_rate, term_months, start_date, end_date, auto_contribution, last_updated_month))
                new_id = cursor.lastrowid
                conn.commit()
                return new_id
            except sqlite3.IntegrityError:
                return None

    def update_asset(self, asset_id, name, type, amount, interest_rate, term_months, start_date, end_date, auto_contribution, last_updated_month):
        with self._conn() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    UPDATE assets 
                    SET name = ?, type = ?, amount = ?, interest_rate = ?, term_months = ?, start_date = ?, end_date = ?, auto_contribution = ?, last_updated_month = ?
                    WHERE id = ?
                ''', (name, type, amount, interest_rate, term_months, start_date, end_date, auto_contribution, last_updated_month, asset_id))
                conn.commit()
                return True
            except sqlite3.IntegrityError:
                return False

    def delete_asset(self, asset_id):
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE transactions SET asset_id = NULL WHERE asset_id = ?", (asset_id,))
            cursor.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
            conn.commit()
            return True

    def update_asset_balance(self, asset_id, new_amount, last_updated_month=None):
        with self._conn() as conn:
            cursor = conn.cursor()
            if last_updated_month:
                cursor.execute("UPDATE assets SET amount = ?, last_updated_month = ? WHERE id = ?", (new_amount, last_updated_month, asset_id))
            else:
                cursor.execute("UPDATE assets SET amount = ? WHERE id = ?", (new_amount, asset_id))
            conn.commit()

    def get_available_months(self):
        """Returns a list of unique months (YYYY-MM) that have transactions"""
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT substr(date, 1, 7) as month FROM transactions ORDER BY month DESC")
            months = [row['month'] for row in cursor.fetchall() if row['month']]
            return months

    # ========== Financial Goals Methods ==========
    def add_goal(self, title, target_amount, goal_type, year, icon='🎯', color='#6366f1', notes=None):
        with self._conn() as conn:
            cursor = conn.cursor()
            from datetime import datetime
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                INSERT INTO financial_goals (title, target_amount, current_amount, goal_type, year, icon, color, is_completed, notes, created_at, updated_at)
                VALUES (?, ?, 0, ?, ?, ?, ?, 0, ?, ?, ?)
            ''', (title, target_amount, goal_type, year, icon, color, notes, now, now))
            new_id = cursor.lastrowid
            conn.commit()
            return new_id

    def get_goals(self, year):
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM financial_goals WHERE year = ? ORDER BY created_at ASC', (year,))
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
            cursor = conn.cursor()
            from datetime import datetime
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            fields = []
            values = []
            if title is not None:
                fields.append('title = ?')
                values.append(title)
            if target_amount is not None:
                fields.append('target_amount = ?')
                values.append(target_amount)
            if current_amount is not None:
                fields.append('current_amount = ?')
                values.append(current_amount)
            if goal_type is not None:
                fields.append('goal_type = ?')
                values.append(goal_type)
            if icon is not None:
                fields.append('icon = ?')
                values.append(icon)
            if color is not None:
                fields.append('color = ?')
                values.append(color)
            if notes is not None:
                fields.append('notes = ?')
                values.append(notes)
            fields.append('updated_at = ?')
            values.append(now)
            values.append(goal_id)
            query = f"UPDATE financial_goals SET {', '.join(fields)} WHERE id = ?"
            cursor.execute(query, values)
            conn.commit()
            return cursor.rowcount > 0

    def delete_goal(self, goal_id):
        with self._conn() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM financial_goals WHERE id = ?', (goal_id,))
            conn.commit()
            return cursor.rowcount > 0

    def update_goal_progress(self, goal_id, current_amount):
        with self._conn() as conn:
            cursor = conn.cursor()
            from datetime import datetime
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                UPDATE financial_goals SET current_amount = ?, updated_at = ? WHERE id = ?
            ''', (current_amount, now, goal_id))
            conn.commit()
            return cursor.rowcount > 0

    def toggle_goal_completed(self, goal_id):
        with self._conn() as conn:
            cursor = conn.cursor()
            from datetime import datetime
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                UPDATE financial_goals SET is_completed = CASE WHEN is_completed = 0 THEN 1 ELSE 0 END, updated_at = ? WHERE id = ?
            ''', (now, goal_id))
            conn.commit()
            cursor.execute('SELECT is_completed FROM financial_goals WHERE id = ?', (goal_id,))
            row = cursor.fetchone()
            return bool(row['is_completed']) if row else None
            
    def get_goal_calculation(self, goal_type, year):
        """Calculate current amount for a goal type based on actual transactions/budgets."""
        with self._conn() as conn:
            cursor = conn.cursor()
            
            if goal_type == 'savings':
                cursor.execute("SELECT SUM(amount) as total FROM assets WHERE type IN ('Cash', 'Bank')")
                res = cursor.fetchone()
                return float(res['total']) if res['total'] is not None else 0.0
            
            elif goal_type == 'income':
                cursor.execute("SELECT SUM(amount) as total FROM transactions WHERE type = 'income' AND strftime('%Y', date) = ?", (str(year),))
                res = cursor.fetchone()
                return float(res['total']) if res['total'] is not None else 0.0
            
            elif goal_type == 'expense_limit':
                cursor.execute("SELECT SUM(amount) as total FROM transactions WHERE type = 'expense' AND strftime('%Y', date) = ?", (str(year),))
                res = cursor.fetchone()
                return float(res['total']) if res['total'] is not None else 0.0
            
            return None
