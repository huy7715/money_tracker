import sqlite3
import os
from .models import Transaction, Budget

class Storage:
    def __init__(self, db_path='money_tracker.db'):
        self.db_path = db_path
        self.init_db()

    def _get_conn(self):
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
                content TEXT NOT NULL
            )
        ''')
        
        # New: Assets Table (Cash, Bank, Savings)
        # Force Drop to ensure schema update and data fix (since it's a new feature with seed data only)
        # In production, we would use ALTER TABLE, but here we want to reset the incorrect seed data.
        cursor.execute("DROP TABLE IF EXISTS assets")
        
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
                INSERT INTO assets (name, type, amount, interest_rate, end_date, start_date, auto_contribution, last_updated_month) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', ("Cumulative Fund", "Cumulative", 3000000, 5.2, "2027-01-29", "2026-01-29", 2000000, "2026-01"))

        conn.commit()
        conn.close()

    def add_transaction(self, transaction: Transaction):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO transactions (amount, category, type, description, date, asset_id)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (transaction.amount, transaction.category, transaction.type, transaction.description, transaction.date, transaction.asset_id))
        transaction.id = cursor.lastrowid
        conn.commit()
        conn.close()
        return transaction

    def get_transactions(self):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM transactions ORDER BY date DESC')
        rows = cursor.fetchall()
        conn.close()
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
        conn = self._get_conn()
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
        
        conn.close()
        return income - expense

    def get_transaction(self, transaction_id):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
        row = cursor.fetchone()
        conn.close()
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
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
        conn.commit()
        conn.close()
        return True

    def update_transaction(self, transaction_id, amount, category, type, description, date):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE transactions
            SET amount = ?, category = ?, type = ?, description = ?, date = ?
            WHERE id = ?
        ''', (amount, category, type, description, date, transaction_id))
        conn.commit()
        conn.close()
        return True

    # Budget methods
    def add_budget(self, budget: Budget):
        conn = self._get_conn()
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
        conn.close()
        return budget

    def get_budgets(self, month=None):
        conn = self._get_conn()
        cursor = conn.cursor()
        if month:
            cursor.execute('SELECT * FROM budgets WHERE month = ?', (month,))
        else:
            cursor.execute('SELECT * FROM budgets')
        rows = cursor.fetchall()
        conn.close()
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
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM budgets WHERE category = ? AND month = ?", (category, month))
        conn.commit()
        conn.close()
        return True

    # Reporting methods
    def get_spending_by_category(self, month):
        """Get total spending per category for a specific month (YYYY-MM)"""
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT category, SUM(amount) as total
            FROM transactions
            WHERE type = 'expense' AND date LIKE ? || '%'
            GROUP BY category
        ''', (month,))
        rows = cursor.fetchall()
        conn.close()
        return {row['category']: row['total'] for row in rows}

    def get_monthly_summary(self, month):
        """Get income, expense, and transaction count for a specific month"""
        conn = self._get_conn()
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
        
        conn.close()
        return {
            'income': income,
            'expense': expense,
            'net': income - expense,
            'count': count
        }

    def get_transactions_by_month(self, month):
        """Get all transactions for a specific month"""
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM transactions
            WHERE date LIKE ? || '%'
            ORDER BY date DESC
        ''', (month,))
        rows = cursor.fetchall()
        conn.close()
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
    def save_diary(self, date, content):
        conn = self._get_conn()
        cursor = conn.cursor()
        
        # If content is empty, delete the entry instead of saving/updating
        if not content or not content.strip():
            cursor.execute('DELETE FROM diary WHERE date = ?', (date,))
        else:
            try:
                cursor.execute('''
                    INSERT INTO diary (date, content)
                    VALUES (?, ?)
                ''', (date, content))
            except sqlite3.IntegrityError:
                cursor.execute('''
                    UPDATE diary
                    SET content = ?
                    WHERE date = ?
                ''', (content, date))
        
        conn.commit()
        conn.close()
        return True

    def get_diary(self, date):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute('SELECT content FROM diary WHERE date = ?', (date,))
        row = cursor.fetchone()
        conn.close()
        return row['content'] if row else ""

    def get_diary_history(self):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute('SELECT date FROM diary ORDER BY date DESC')
        rows = cursor.fetchall()
        conn.close()
        return [row['date'] for row in rows]

    def get_assets(self):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM assets")
        rows = cursor.fetchall()
        conn.close()
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
    
    def update_asset_balance(self, asset_id, new_amount, last_updated_month=None):
        conn = self._get_conn()
        cursor = conn.cursor()
        if last_updated_month:
            cursor.execute("UPDATE assets SET amount = ?, last_updated_month = ? WHERE id = ?", (new_amount, last_updated_month, asset_id))
        else:
            cursor.execute("UPDATE assets SET amount = ? WHERE id = ?", (new_amount, asset_id))
        conn.commit()
        conn.close()




