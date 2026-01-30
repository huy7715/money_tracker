from .storage import Storage
from .models import Transaction, Budget
from datetime import datetime

class FinanceManager:
    def __init__(self, db_path='money_tracker.db'):
        self.storage = Storage(db_path)

    def add_transaction(self, amount, category, type, description, date=None, asset_id=None):
        if not date:
            date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        transaction = Transaction(
            amount=float(amount),
            category=category,
            type=type,
            description=description,
            date=date,
            asset_id=asset_id
        )
        
        # Save transaction
        new_transaction = self.storage.add_transaction(transaction)
        
        # If asset_id provided, update asset balance
        if asset_id:
            try:
                # Get current asset details
                asset = next((a for a in self.storage.get_assets() if str(a['id']) == str(asset_id)), None)
                if asset:
                    if type == 'expense':
                        new_balance = asset['amount'] - transaction.amount
                    else: # income
                        new_balance = asset['amount'] + transaction.amount
                        
                    # Update balance (preserving last_updated_month if exists)
                    self.storage.update_asset_balance(asset['id'], new_balance, asset.get('last_updated_month'))
            except Exception as e:
                print(f"Error updating asset balance: {e}")
                
        return new_transaction

    def get_recent_transactions(self, month=None):
        if month:
            return self.storage.get_transactions_by_month(month)
        return self.storage.get_transactions()

    def get_balance(self, month=None):
        return self.storage.get_balance(month)

    def delete_transaction(self, transaction_id):
        # 1. Fetch transaction details before deletion
        transaction = self.storage.get_transaction(transaction_id)
        
        if transaction and transaction.asset_id:
            try:
                # 2. Get current asset details
                asset = next((a for a in self.storage.get_assets() if str(a['id']) == str(transaction.asset_id)), None)
                if asset:
                    # 3. Reverse the amount
                    if transaction.type == 'expense':
                        # If it was an expense, refund it
                        new_balance = asset['amount'] + transaction.amount
                    else:
                        # If it was income, remove it
                        new_balance = asset['amount'] - transaction.amount
                    
                    self.storage.update_asset_balance(asset['id'], new_balance, asset.get('last_updated_month'))
            except Exception as e:
                print(f"Error reversing asset balance move: {e}")

        # 4. Perform deletion
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

    def save_diary(self, date, content):
        return self.storage.save_diary(date, content)

    def get_diary(self, date):
        return self.storage.get_diary(date)

    def get_diary_history(self):
        return self.storage.get_diary_history()

    def get_assets(self):
        return self.storage.get_assets()

    def check_recurring_contributions(self, current_month):
        """
        Check and process auto-contributions for the given month (YYYY-MM).
        If an asset has auto_contribution > 0 and last_updated_month < current_month,
        1. Add Expense Transaction (Deduct from Income context)
        2. Increase Asset Amount
        3. Update last_updated_month
        """
        assets = self.storage.get_assets()
        for asset in assets:
            if asset['auto_contribution'] > 0:
                last_month = asset['last_updated_month']
                # If never updated or older than current month
                if not last_month or last_month < current_month:
                    # Perform Contribution
                    print(f"Processing recurring contribution for {asset['name']} in {current_month}")
                    
                    # 1. Add Transaction
                    self.add_transaction(
                        amount=asset['auto_contribution'],
                        category="Savings",
                        type="expense",
                        description=f"Auto-deposit to {asset['name']}",
                        date=f"{current_month}-01" # Default to 1st of month
                    )
                    
                    # 2. Update Asset
                    new_amount = asset['amount'] + asset['auto_contribution']
                    self.storage.update_asset_balance(asset['id'], new_amount, current_month)
                    return True # Processed something
        return False



