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
                date TEXT NOT NULL
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
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE NOT NULL,
                content TEXT NOT NULL
            )
        ''')
        conn.commit()
        conn.close()

    def add_transaction(self, transaction: Transaction):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO transactions (amount, category, type, description, date)
            VALUES (?, ?, ?, ?, ?)
        ''', (transaction.amount, transaction.category, transaction.type, transaction.description, transaction.date))
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
                date=row['date']
            ))
        return transactions

    def get_balance(self):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT SUM(amount) FROM transactions WHERE type='income'")
        income = cursor.fetchone()[0] or 0.0
        cursor.execute("SELECT SUM(amount) FROM transactions WHERE type='expense'")
        expense = cursor.fetchone()[0] or 0.0
        conn.close()
        return income - expense

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
                date=row['date']
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

