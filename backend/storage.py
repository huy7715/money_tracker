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

    def _get_conn(self):
        """Deprecated: Use _conn() context manager instead"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        conn = self._get_conn()
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
        # Add column if it doesn't exist (for existing DBs)
        try:
            cursor.execute("ALTER TABLE transactions ADD COLUMN asset_id INTEGER")
        except sqlite3.OperationalError:
            pass # Column already exists
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
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE NOT NULL,
                content TEXT NOT NULL,
                title TEXT
            )
        ''')
        # Add title column if it doesn't exist
        try:
            cursor.execute("ALTER TABLE diary ADD COLUMN title TEXT")
        except sqlite3.OperationalError:
            pass # Column already exists
        
        # Assets Table (Cash, Bank, Savings)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                type TEXT NOT NULL, -- 'Cash', 'Bank', 'Savings', 'Cumulative'
                amount REAL NOT NULL,
                interest_rate REAL DEFAULT 0,
                term_months INTEGER DEFAULT 0,
                start_date TEXT,
                end_date TEXT,
                auto_contribution REAL DEFAULT 0, -- Amount to auto-add monthly
                last_updated_month TEXT -- 'YYYY-MM' of last contribution
            )
        ''')

        # Seeding: Insert user's specific assets
        cursor.execute("SELECT count(*) FROM assets")
        if cursor.fetchone()[0] == 0:
            # Cash: 4.000.000
            cursor.execute("INSERT INTO assets (name, type, amount) VALUES (?, ?, ?)", ("Cash", "Cash", 4000000))
            
            # Bank: 22.000.000
            cursor.execute("INSERT INTO assets (name, type, amount) VALUES (?, ?, ?)", ("Bank Account", "Bank", 22000000))
            
            # Savings 1: 90m, 3.5%, ends 16/06/2026
            cursor.execute("INSERT INTO assets (name, type, amount, interest_rate, end_date) VALUES (?, ?, ?, ?, ?)", 
                           ("Long Term Savings", "Savings", 90000000, 3.5, "2026-06-16"))
            
            # Savings 2: 12.5m, 5.2%, ends 29/01/2027
            cursor.execute("INSERT INTO assets (name, type, amount, interest_rate, end_date, start_date) VALUES (?, ?, ?, ?, ?, ?)", 
                           ("Savings Book 1", "Savings", 12500000, 5.2, "2027-01-29", "2024-01-29"))
            
            # Savings 3: 12.5m, 5.2%, ends 29/01/2027
            cursor.execute("INSERT INTO assets (name, type, amount, interest_rate, end_date, start_date) VALUES (?, ?, ?, ?, ?, ?)", 
                           ("Savings Book 2", "Savings", 12500000, 5.2, "2027-01-29", "2024-01-29"))
                           
            # Cumulative Fund: 3m initial, 2m monthly, 5.2%, ends 29/01/2027
            # Created "yesterday" (2026-01-29 presumably based on user context, or simply Jan 2026)
            # Auto-contribution set to 2,000,000
            # last_updated_month set to '2026-01' so it doesn't trigger again for this Jan.
            cursor.execute('''
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', ("Cumulative Fund", "Cumulative", 3000000, 5.2, "2027-01-29", "2026-01-29", 2000000, "2026-01"))
        
        # Performance Indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_asset ON transactions(asset_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_diary_date ON diary(date)")

        conn.commit()
        conn.close()

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
                    asset_id=row['asset_id'] if 'asset_id' in row.keys() else None
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
                    asset_id=row['asset_id'] if 'asset_id' in row.keys() else None
                ))
            return transactions

    # Diary methods
    def save_diary(self, date, content, title=None):
        with self._conn() as conn:
            cursor = conn.cursor()
            
            # If content is empty, delete the entry instead of saving/updating
            if not content or not content.strip():
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
            cursor.execute('SELECT date, title FROM diary ORDER BY date DESC')
            rows = cursor.fetchall()
            return [{"date": row['date'], "title": row['title']} for row in rows]

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
                    "auto_contribution": row["auto_contribution"] if "auto_contribution" in row.keys() else 0,
                    "last_updated_month": row["last_updated_month"] if "last_updated_month" in row.keys() else None
                })
            return assets
    
    def get_asset_balance_adjustment_after(self, asset_id, month):
        """
        Calculate total changes to an asset after the specified month (YYYY-MM).
        Returns SUM(income_amount) - SUM(expense_amount) for transactions > last day of month.
        """
        with self._conn() as conn:
            cursor = conn.cursor()
            
            # We want transactions happening AFTER this month.
            # SQLite comparison: '2026-02' > '2026-01' works.
            # But '2026-01-15' starts with '2026-01'.
            # We want anything where date >= 'YYYY-(MM+1)-01'
            # Easier: date NOT LIKE 'YYYY-MM%' AND date > 'YYYY-MM'
            
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
            # Extract YYYY-MM from date strings like 'YYYY-MM-DD HH:MM:SS'
            cursor.execute("SELECT DISTINCT substr(date, 1, 7) as month FROM transactions ORDER BY month DESC")
            months = [row['month'] for row in cursor.fetchall() if row['month']]
            return months




