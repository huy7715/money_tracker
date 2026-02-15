from flask import Flask, render_template, request, jsonify, Response
from flask_socketio import SocketIO, emit
import csv
import io
from money_tracker.backend.manager import FinanceManager
import os
import subprocess
import json
from datetime import datetime
import sys

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Determine database path: works for both dev (.py) and frozen (.exe)
if getattr(sys, 'frozen', False):
    # Running as PyInstaller .exe — DB sits next to the .exe
    root_dir = os.path.dirname(sys.executable)
else:
    # Running as .py script — DB sits at project root
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

manager = FinanceManager(db_path=os.path.join(root_dir, 'money_tracker.db'))

# Cache for recurring contribution check to prevent race condition
_last_contribution_check = None

def check_and_process_contributions():
    """Check and process recurring contributions only once per day"""
    global _last_contribution_check
    current_date = datetime.now().strftime("%Y-%m-%d")
    
    # Only process if we haven't checked today
    if _last_contribution_check != current_date:
        current_month = datetime.now().strftime("%Y-%m")
        manager.check_recurring_contributions(current_month)
        _last_contribution_check = current_date

@app.route('/')
def index():
    # User request: "Total Balance" should show only specific month usage (Net Income)
    current_month = datetime.now().strftime("%Y-%m")
    
    # Auto-process recurring savings (cached to run only once per day)
    check_and_process_contributions()

    # Calculate monthly net income
    balance = manager.get_balance(current_month)
    
    # User request: Chart and List should also show only specific month usage
    transactions = manager.get_recent_transactions(current_month)
    
    return render_template('index.html', balance=balance, transactions=transactions)

@app.route('/reports')
def reports():
    return render_template('reports.html')


@app.route('/add', methods=['POST'])
def add_transaction():
    data = request.json
    
    # Input validation
    try:
        # Validate required fields
        if not data.get('amount') or not data.get('category') or not data.get('type'):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        # Validate amount
        amount = float(data['amount'])
        if amount <= 0:
            return jsonify({'success': False, 'error': 'Amount must be greater than 0'}), 400
        
        # Validate type
        tx_type = data['type']
        if tx_type not in ['income', 'expense']:
            return jsonify({'success': False, 'error': 'Type must be "income" or "expense"'}), 400
        
        # Validate category
        valid_categories = ['Food', 'Rent', 'Utilities', 'Transport', 'Groceries', 'Shopping', 
                          'Entertainment', 'Travel', 'Health', 'Salary', 'Bonus', 'Investment', 
                          'Other Income', 'Other', 'Savings']
        category = data['category']
        if category not in valid_categories:
            return jsonify({'success': False, 'error': f'Invalid category: {category}'}), 400
        
        # Validate asset_id if provided
        asset_id = data.get('asset_id')
        if asset_id is not None and asset_id != '':
            try:
                asset_id = int(asset_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'error': 'Invalid asset_id'}), 400
        else:
            asset_id = None
        
        manager.add_transaction(
            amount=amount,
            category=category,
            type=tx_type,
            description=data.get('description', ''),
            date=data.get('date'),
            asset_id=asset_id
        )
        socketio.emit('data_updated', {'type': 'transaction', 'action': 'add'})
        return jsonify({'success': True}), 201
        
    except ValueError as e:
        return jsonify({'success': False, 'error': f'Invalid data type: {str(e)}'}), 400
    except KeyError as e:
        return jsonify({'success': False, 'error': f'Missing field: {str(e)}'}), 400
    except Exception as e:
        print(f"Unexpected error in add_transaction: {type(e).__name__}: {e}")
        return jsonify({'success': False, 'error': 'Internal server error'}), 500

@app.route('/delete/<int:transaction_id>', methods=['DELETE'])
def delete_transaction(transaction_id):
    try:
        manager.delete_transaction(transaction_id)
        socketio.emit('data_updated', {'type': 'transaction', 'action': 'delete'})
        return jsonify({'success': True})
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        print(f"Unexpected error in delete_transaction: {type(e).__name__}: {e}")
        return jsonify({'success': False, 'error': 'Internal server error'}), 500

@app.route('/update/<int:transaction_id>', methods=['PUT'])
def update_transaction(transaction_id):
    data = request.json
    
    # Input validation
    try:
        # Validate required fields
        if not data.get('amount') or not data.get('category') or not data.get('type') or not data.get('date'):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        # Validate amount
        amount = float(data['amount'])
        if amount <= 0:
            return jsonify({'success': False, 'error': 'Amount must be greater than 0'}), 400
        
        # Validate type
        tx_type = data['type']
        if tx_type not in ['income', 'expense']:
            return jsonify({'success': False, 'error': 'Type must be "income" or "expense"'}), 400
        
        # Validate category
        valid_categories = ['Food', 'Rent', 'Utilities', 'Transport', 'Groceries', 'Shopping', 
                          'Entertainment', 'Travel', 'Health', 'Salary', 'Bonus', 'Investment', 
                          'Other Income', 'Other', 'Savings']
        category = data['category']
        if category not in valid_categories:
            return jsonify({'success': False, 'error': f'Invalid category: {category}'}), 400
        
        manager.update_transaction(
            transaction_id=transaction_id,
            amount=amount,
            category=category,
            type=tx_type,
            description=data.get('description', ''),
            date=data['date']
        )
        socketio.emit('data_updated', {'type': 'transaction', 'action': 'update'})
        return jsonify({'success': True})
        
    except ValueError as e:
        return jsonify({'success': False, 'error': f'Invalid data: {str(e)}'}), 400
    except KeyError as e:
        return jsonify({'success': False, 'error': f'Missing field: {str(e)}'}), 400
    except Exception as e:
        print(f"Unexpected error in update_transaction: {type(e).__name__}: {e}")
        return jsonify({'success': False, 'error': 'Internal server error'}), 500

@app.route('/api/data')
def get_data():
    # Use standard month if not provided
    month = request.args.get('month') # Format: YYYY-MM
    current_month = datetime.now().strftime("%Y-%m")
    effective_month = month if month else current_month
    
    # Auto-process recurring savings (cached to run only once per day)
    check_and_process_contributions()
    
    # Return data for selected month
    balance = manager.get_balance(effective_month)
    transactions = manager.get_recent_transactions(effective_month)
    all_time = manager.get_all_time_stats()
    return jsonify({
        'balance': balance,
        'transactions': [vars(t) for t in transactions],
        'all_time': all_time
    })

@app.route('/api/available-months')
def get_available_months():
    months = manager.get_available_months()
    return jsonify(months)

@app.route('/export')
def export_data():
    transactions = manager.get_recent_transactions()
    
    # Generate CSV
    def generate():
        # Excel needs BOM to recognize UTF-8
        yield '\ufeff'
        
        data = io.StringIO()
        w = csv.writer(data)
        
        # Header
        w.writerow(('ID', 'Date', 'Category', 'Type', 'Amount', 'Description'))
        yield data.getvalue()
        data.seek(0)
        data.truncate(0)
        
        # Rows
        for t in transactions:
            w.writerow((
                t.id,
                f"\t{t.date}", # Prepend tab to force text display in Excel (prevents #######)
                t.category,
                t.type,
                t.amount,
                t.description or '' 
            ))
            yield data.getvalue()
            data.seek(0)
            data.truncate(0)

    # Return as stream
    response = Response(generate(), mimetype='text/csv')
    response.headers.set("Content-Disposition", "attachment", filename="transactions.csv")
    return response

@app.route('/api/magic-assistant', methods=['POST'])
def magic_assistant():
    data = request.json
    text = data.get('text')
    if not text:
        return jsonify({'error': 'No text provided'}), 400
    
    try:
        from money_tracker.backend.ai_service import AIService
        ai_service = AIService()
        result = ai_service.parse_magic_prompt(text)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai-parse', methods=['POST'])
def ai_parse():
    data = request.json
    text = data.get('text')
    if not text:
        return jsonify({'error': 'No text provided'}), 400
    
    try:
        from money_tracker.backend.ai_service import AIService
        ai_service = AIService()
        result = ai_service.parse_transaction(text) # Uses backward compatibility method
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/bulk-extract', methods=['POST'])
def ai_bulk_extract():
    data = request.json
    text = data.get('text')
    if not text:
        return jsonify({'error': 'No text provided'}), 400
    
    try:
        from money_tracker.backend.ai_service import AIService
        ai_service = AIService()
        result = ai_service.extract_bulk_transactions(text)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500



@app.route('/api/switch-model', methods=['POST'])
def switch_model():
    data = request.json
    provider = data.get('provider')
    if not provider:
        return jsonify({'error': 'No provider specified'}), 400
    
    from money_tracker.backend.ai_service import AIService
    if AIService.set_provider(provider):
        return jsonify({'success': True, 'provider': AIService.get_active_provider()})
    else:
        return jsonify({'error': 'Invalid provider'}), 400

@app.route('/api/ai-info')
def get_ai_info():
    try:
        from money_tracker.backend.ai_service import AIService
        ai_service = AIService()
        return jsonify(ai_service.get_model_info())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Budget endpoints
@app.route('/api/budget', methods=['POST'])
def set_budget():
    data = request.json
    try:
        adjustment = data.get('adjustment')
        amount = data['monthly_limit']
        category = data['category']
        month = data.get('month')
        
        if adjustment == 'increase':
            manager.adjust_budget(category, amount, month)
        elif adjustment == 'decrease':
            manager.adjust_budget(category, -amount, month)
        else:
            manager.set_budget(
                category=category,
                monthly_limit=amount,
                month=month
            )
        socketio.emit('data_updated', {'type': 'budget', 'action': 'set'})
        return jsonify({'success': True}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/budget')
def get_budgets():
    try:
        month = request.args.get('month')
        budgets = manager.get_budgets(month)
        return jsonify([vars(b) for b in budgets])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/budget/<category>', methods=['DELETE'])
def delete_budget(category):
    try:
        month = request.args.get('month')
        manager.delete_budget(category, month)
        socketio.emit('data_updated', {'type': 'budget', 'action': 'delete'})
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/budget-status')
def get_budget_status():
    try:
        month = request.args.get('month')
        status = manager.get_budget_status(month)
        return jsonify(status)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Report endpoints
@app.route('/api/monthly-report')
def get_monthly_report():
    try:
        month = request.args.get('month')
        report = manager.get_monthly_report(month)
        return jsonify(report)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Diary endpoints
@app.route('/api/diary', methods=['GET'])
def get_diary():
    try:
        date = request.args.get('date')
        if not date:
            return jsonify({'error': 'No date provided'}), 400
        result = manager.get_diary(date)
        return jsonify(result) # result is {'content': ..., 'title': ...}
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/diary', methods=['POST'])
def save_diary():
    try:
        data = request.json
        date = data.get('date')
        content = data.get('content')
        title = data.get('title')
        if not date:
            return jsonify({'error': 'No date provided'}), 400
        manager.save_diary(date, content, title)
        socketio.emit('data_updated', {'type': 'diary', 'date': date})
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/diary/history', methods=['GET'])
def get_diary_history():
    try:
        history = manager.get_diary_history()
        return jsonify({'history': history})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/assets', methods=['GET'])
def get_assets():
    try:
        month = request.args.get('month')
        assets = manager.get_assets(month)
        return jsonify(assets)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/assets', methods=['GET', 'POST'])
def handle_assets():
    if request.method == 'GET':
        return jsonify(manager.storage.get_assets())
    
    # POST - Create new asset
    data = request.json
    try:
        new_id = manager.storage.add_asset(
            name=data['name'],
            type=data['type'],
            amount=data.get('amount', 0),
            interest_rate=data.get('interest_rate', 0),
            term_months=data.get('term_months', 0),
            start_date=data.get('start_date'),
            end_date=data.get('end_date'),
            auto_contribution=data.get('auto_contribution', 0),
            last_updated_month=data.get('last_updated_month')
        )
        if new_id:
            return jsonify({'success': True, 'id': new_id})
        else:
            return jsonify({'success': False, 'error': 'Asset name already exists'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/assets/<int:asset_id>', methods=['PUT', 'DELETE'])
def handle_asset_item(asset_id):
    if request.method == 'DELETE':
        success = manager.storage.delete_asset(asset_id)
        return jsonify({'success': success})
    
    # PUT - Update asset
    data = request.json
    try:
        success = manager.storage.update_asset(
            asset_id=asset_id,
            name=data['name'],
            type=data['type'],
            amount=data.get('amount', 0),
            interest_rate=data.get('interest_rate', 0),
            term_months=data.get('term_months', 0),
            start_date=data.get('start_date'),
            end_date=data.get('end_date'),
            auto_contribution=data.get('auto_contribution', 0),
            last_updated_month=data.get('last_updated_month')
        )
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Update failed'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
        
@app.route('/api/backup')
def backup_database():
    try:
        db_path = os.path.join(root_dir, 'money_tracker.db')
        with open(db_path, 'rb') as f:
            data = f.read()
        return Response(
            data,
            mimetype="application/x-sqlite3",
            headers={"Content-disposition": "attachment; filename=money_tracker_backup.db"}
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/ag-quota')
def ag_quota_dashboard():
    return render_template('ag_quota.html')

@app.route('/api/ag-quota')
def get_ag_quota_data():
    try:
        # Path to the ag-quota binary
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        exe_path = os.path.join(base_dir, 'anti-gravity-quota', 'ag-quota.exe')
        
        # Run the command with --all and --json flags
        # Use shell=True on Windows to avoid some path issues, but direct list is safer if exe_path is correct.
        # Ensure we capture stderr to debug.
        result = subprocess.run(
            [exe_path, 'quota', '--all', '--json'], 
            capture_output=True, 
            text=True, 
            cwd=os.path.dirname(exe_path),
            encoding='utf-8', # Force utf-8
            errors='replace'
        )
        
        if result.returncode != 0:
            return jsonify({'error': f"Command failed: {result.stderr}"}), 500
            
        # Parse the NDJSON output (multiple JSON objects, one per line or concatenated)
        output = result.stdout.strip()
        data = []
        if output:
            # Attempt to split by closing brace + newline or just sequential parsing if possible
            # Simple approach: split by lines, try parse each.
            # If formatted with newlines (pretty printed?), this might be harder.
            # The CLI output shown in tool use seems to be pretty-printed.
            # Use a regex or simple decoder to handle concatenated JSONs.
            
            # Since the CLI output shown was pretty-printed, we can't just split by line.
            # We will use raw string manipulation to find separate json objects.
            # Or better, we can assume the CLI outputs valid separate JSONs.
            decoder = json.JSONDecoder()
            pos = 0
            while pos < len(output):
                try:
                    obj, idx = decoder.raw_decode(output[pos:])
                    data.append(obj)
                    pos += idx
                    # Skip whitespace
                    while pos < len(output) and output[pos].isspace():
                        pos += 1
                except json.JSONDecodeError:
                    break
                    
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/add-account', methods=['POST'])
def add_account():
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        exe_path = os.path.join(base_dir, 'anti-gravity-quota', 'ag-quota.exe')
        
        # Start the login process. Since it interacts with the browser, we start it detached?
        # No, 'login' command blocks until success. We want to wait for it so the UI knows when it's done.
        # But requests have timeout. 
        # For now, we'll run it synchronously. The user has to click "Login" in browser quickly.
        
        result = subprocess.run(
            [exe_path, 'login'],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(exe_path)
        )
        
        if result.returncode != 0:
             return jsonify({'success': False, 'error': result.stderr}), 500
             
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
