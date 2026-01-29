from flask import Flask, render_template, request, jsonify, Response
import csv
import io
from money_tracker.backend.manager import FinanceManager
import os

app = Flask(__name__)
# Initialize manager with a database in the root directory
# ../../../money_tracker.db relative to money_tracker/web/app.py
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
manager = FinanceManager(db_path=os.path.join(root_dir, 'money_tracker.db'))

@app.route('/')
def index():
    balance = manager.get_balance()
    transactions = manager.get_recent_transactions()
    return render_template('index.html', balance=balance, transactions=transactions)

@app.route('/reports')
def reports():
    return render_template('reports.html')


@app.route('/add', methods=['POST'])
def add_transaction():
    data = request.json
    try:
        manager.add_transaction(
            amount=data['amount'],
            category=data['category'],
            type=data['type'],
            description=data.get('description', ''),
            date=data.get('date')
        )
        return jsonify({'success': True}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/delete/<int:transaction_id>', methods=['DELETE'])
def delete_transaction(transaction_id):
    try:
        manager.delete_transaction(transaction_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/update/<int:transaction_id>', methods=['PUT'])
def update_transaction(transaction_id):
    data = request.json
    try:
        manager.update_transaction(
            transaction_id=transaction_id,
            amount=data['amount'],
            category=data['category'],
            type=data['type'],
            description=data.get('description', ''),
            date=data['date']
        )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/data')
def get_data():
    balance = manager.get_balance()
    transactions = manager.get_recent_transactions()
    return jsonify({
        'balance': balance,
        'transactions': [vars(t) for t in transactions]
    })

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

@app.route('/api/analyze')
def analyze_spending():
    try:
        transactions = manager.get_recent_transactions()
        if not transactions:
            return jsonify({'analysis': "You don't have enough transactions yet! Add some spending first."})

        # Format transactions for AI
        tx_str = ""
        for t in transactions:
            tx_str += f"- {t.date}: {t.category} ({t.type}) - {t.amount} ({t.description})\n"

        from money_tracker.backend.ai_service import AIService
        ai_service = AIService()
        analysis = ai_service.analyze_spending(tx_str)
        
        return jsonify({'analysis': analysis})
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
        content = manager.get_diary(date)
        return jsonify({'content': content})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/diary', methods=['POST'])
def save_diary():
    try:
        data = request.json
        date = data.get('date')
        content = data.get('content')
        if not date:
            return jsonify({'error': 'No date provided'}), 400
        manager.save_diary(date, content)
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

if __name__ == '__main__':
    app.run(debug=True)
