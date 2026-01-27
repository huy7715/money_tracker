from .storage import Storage
from .models import Transaction, Budget
from datetime import datetime

class FinanceManager:
    def __init__(self, db_path='money_tracker.db'):
        self.storage = Storage(db_path)

    def add_transaction(self, amount, category, type, description, date=None):
        if not date:
            date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        transaction = Transaction(
            amount=float(amount),
            category=category,
            type=type,
            description=description,
            date=date
        )
        return self.storage.add_transaction(transaction)

    def get_recent_transactions(self):
        return self.storage.get_transactions()

    def get_balance(self):
        return self.storage.get_balance()

    def delete_transaction(self, transaction_id):
        return self.storage.delete_transaction(transaction_id)

    def update_transaction(self, transaction_id, amount, category, type, description, date):
        if not date:
            date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return self.storage.update_transaction(transaction_id, amount, category, type, description, date)

    # Budget management
    def set_budget(self, category, monthly_limit, month=None):
        """Set or update budget for a category in a specific month"""
        if month is None:
            month = datetime.now().strftime("%Y-%m")
        budget = Budget(
            category=category,
            monthly_limit=float(monthly_limit),
            month=month
        )
        return self.storage.add_budget(budget)

    def get_budgets(self, month=None):
        """Get all budgets for a specific month (defaults to current month)"""
        if month is None:
            month = datetime.now().strftime("%Y-%m")
        return self.storage.get_budgets(month)

    def delete_budget(self, category, month=None):
        """Delete budget for a category in a specific month"""
        if month is None:
            month = datetime.now().strftime("%Y-%m")
        return self.storage.delete_budget(category, month)

    def adjust_budget(self, category, amount, month=None):
        """Adjust (increase/decrease) budget for a category"""
        if month is None:
            month = datetime.now().strftime("%Y-%m")
        
        budgets = self.storage.get_budgets(month)
        current_budget = next((b for b in budgets if b.category.lower() == category.lower()), None)
        
        if current_budget:
            new_limit = max(0, current_budget.monthly_limit + amount)
        else:
            # If no budget exists, treat adjustment as setting a new one (starting from 0)
            new_limit = max(0, amount)
            
        return self.set_budget(category, new_limit, month)

    def get_budget_status(self, month=None):
        """Get budget status with spending vs limits and warning levels"""
        if month is None:
            month = datetime.now().strftime("%Y-%m")
        
        budgets = self.storage.get_budgets(month)
        spending = self.storage.get_spending_by_category(month)
        
        status = []
        for budget in budgets:
            spent = spending.get(budget.category, 0.0)
            percentage = (spent / budget.monthly_limit * 100) if budget.monthly_limit > 0 else 0
            
            # Determine warning level
            if percentage >= 100:
                level = 'danger'
            elif percentage >= 80:
                level = 'warning'
            else:
                level = 'safe'
            
            status.append({
                'category': budget.category,
                'limit': budget.monthly_limit,
                'spent': spent,
                'remaining': budget.monthly_limit - spent,
                'percentage': percentage,
                'level': level
            })
        
        return status

    # Reporting
    def get_monthly_report(self, month=None):
        """Get comprehensive monthly report"""
        if month is None:
            month = datetime.now().strftime("%Y-%m")
        
        summary = self.storage.get_monthly_summary(month)
        spending_by_category = self.storage.get_spending_by_category(month)
        transactions = self.storage.get_transactions_by_month(month)
        
        return {
            'month': month,
            'summary': summary,
            'spending_by_category': spending_by_category,
            'transactions': [t.__dict__ for t in transactions]
        }

