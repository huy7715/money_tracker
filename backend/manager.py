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
                if not asset:
                    print(f"Warning: Asset {asset_id} not found, skipping balance update")
                    return new_transaction
                    
                if type == 'expense':
                    new_balance = asset['amount'] - transaction.amount
                else:  # income
                    new_balance = asset['amount'] + transaction.amount
                    
                # Update balance (preserving last_updated_month if exists)
                self.storage.update_asset_balance(asset['id'], new_balance, asset.get('last_updated_month'))
            except (KeyError, ValueError, TypeError) as e:
                print(f"Error updating asset balance for asset {asset_id}: {type(e).__name__}: {e}")
                # Don't fail the transaction, just log the error
            except Exception as e:
                print(f"Unexpected error updating asset balance: {type(e).__name__}: {e}")
                # Re-raise unexpected errors
                raise
                
        return new_transaction

    def get_recent_transactions(self, month=None):
        if month:
            return self.storage.get_transactions_by_month(month)
        return self.storage.get_transactions()

    def get_balance(self, month=None):
        return self.storage.get_balance(month)

    def get_all_time_stats(self):
        return self.storage.get_all_time_stats()

    def delete_transaction(self, transaction_id):
        # 1. Fetch transaction details before deletion
        transaction = self.storage.get_transaction(transaction_id)
        
        if transaction and transaction.asset_id:
            try:
                # 2. Get current asset details
                asset = next((a for a in self.storage.get_assets() if str(a['id']) == str(transaction.asset_id)), None)
                if not asset:
                    print(f"Warning: Asset {transaction.asset_id} not found during deletion, skipping balance reversal")
                else:
                    # 3. Reverse the amount
                    if transaction.type == 'expense':
                        # If it was an expense, refund it
                        new_balance = asset['amount'] + transaction.amount
                    else:
                        # If it was income, remove it
                        new_balance = asset['amount'] - transaction.amount
                    
                    self.storage.update_asset_balance(asset['id'], new_balance, asset.get('last_updated_month'))
            except (KeyError, ValueError, TypeError) as e:
                print(f"Error reversing asset balance for asset {transaction.asset_id}: {type(e).__name__}: {e}")
            except Exception as e:
                print(f"Unexpected error reversing asset balance: {type(e).__name__}: {e}")
                raise

        # 4. Perform deletion
        return self.storage.delete_transaction(transaction_id)

    def update_transaction(self, transaction_id, amount, category, type, description, date):
        """Update transaction and properly handle asset balance changes"""
        if not date:
            date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # 1. Get old transaction details BEFORE update
        old_transaction = self.storage.get_transaction(transaction_id)
        if not old_transaction:
            raise ValueError(f"Transaction {transaction_id} not found")
        
        # 2. Reverse old asset impact if it had an asset
        if old_transaction.asset_id:
            try:
                asset = next((a for a in self.storage.get_assets() if str(a['id']) == str(old_transaction.asset_id)), None)
                if asset:
                    # Reverse the old transaction's effect
                    if old_transaction.type == 'expense':
                        # Refund the expense
                        reversed_balance = asset['amount'] + old_transaction.amount
                    else:  # income
                        # Remove the income
                        reversed_balance = asset['amount'] - old_transaction.amount
                    
                    self.storage.update_asset_balance(asset['id'], reversed_balance, asset.get('last_updated_month'))
            except Exception as e:
                # Log but don't fail - we'll still update the transaction
                print(f"Warning: Failed to reverse old asset balance: {e}")
        
        # 3. Update the transaction in database
        self.storage.update_transaction(transaction_id, amount, category, type, description, date)
        
        # 4. Apply new asset impact (using the SAME asset_id as before)
        # Note: Currently we don't support changing asset_id during edit
        if old_transaction.asset_id:
            try:
                asset = next((a for a in self.storage.get_assets() if str(a['id']) == str(old_transaction.asset_id)), None)
                if asset:
                    # Apply the new transaction's effect
                    if type == 'expense':
                        new_balance = asset['amount'] - float(amount)
                    else:  # income
                        new_balance = asset['amount'] + float(amount)
                    
                    self.storage.update_asset_balance(asset['id'], new_balance, asset.get('last_updated_month'))
            except Exception as e:
                # This is more critical - we should log and potentially rollback
                print(f"Error: Failed to apply new asset balance: {e}")
                # Consider rolling back the transaction update here
                raise
        
        return True

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

    def save_diary(self, date, content, title=None):
        return self.storage.save_diary(date, content, title)

    def get_diary(self, date):
        return self.storage.get_diary(date)

    def get_diary_history(self):
        return self.storage.get_diary_history()

    def get_assets(self, month=None):
        assets = self.storage.get_assets()
        
        if month:
            # If a month is provided, calculate the balance as of the end of that month
            for asset in assets:
                adjustment = self.storage.get_asset_balance_adjustment_after(asset['id'], month)
                # Balance(Month) = CurrentBalance - ChangesMadeAfterMonth
                asset['amount'] = asset['amount'] - adjustment
                
        return assets

    def check_recurring_contributions(self, real_current_month):
        """
        Check and process auto-contributions for the given month (YYYY-MM).
        Only triggers if last_updated_month < real_current_month.
        """
        assets = self.storage.get_assets()
        any_processed = False
        for asset in assets:
            if asset.get('auto_contribution', 0) > 0:
                last_month = asset['last_updated_month']
                
                # If never updated or older than real current month
                if not last_month or last_month < real_current_month:
                    # Perform Contribution
                    print(f"Processing recurring contribution for {asset['name']} in {real_current_month}")
                    
                    # 1. Add Transaction (Linked to asset)
                    self.add_transaction(
                        amount=asset['auto_contribution'],
                        category="Savings",
                        type="expense",
                        description=f"Auto-deposit to {asset['name']}",
                        date=f"{real_current_month}-01 00:00:01",
                        asset_id=asset['id']
                    )
                    
                    # 2. Update Asset
                    new_amount = asset['amount'] + asset['auto_contribution']
                    self.storage.update_asset_balance(asset['id'], new_amount, real_current_month)
                    any_processed = True
        return any_processed

    def get_available_months(self):
        return self.storage.get_available_months()



