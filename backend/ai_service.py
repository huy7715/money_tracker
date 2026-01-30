import google.generativeai as genai
from openai import OpenAI
import os
import json
import datetime
from dotenv import load_dotenv

load_dotenv()

class AIService:
    # State management for active provider
    _active_provider = "openai" # default

    def __init__(self):
        # OpenAI Setup
        self.openai_key = os.getenv("OPENAI_API_KEY")
        self.openai_client = None
        if self.openai_key:
            self.openai_client = OpenAI(api_key=self.openai_key)
        
        # Gemini Setup
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        self.gemini_model = None
        if self.gemini_key:
            genai.configure(api_key=self.gemini_key)
            self.gemini_model = genai.GenerativeModel('gemini-2.0-flash')

    @classmethod
    def set_provider(cls, provider):
        if provider.lower() in ["openai", "gemini"]:
            cls._active_provider = provider.lower()
            return True
        return False

    @classmethod
    def get_active_provider(cls):
        return cls._active_provider

    def get_model_info(self):
        provider = self.get_active_provider()
        if provider == "openai":
            return {"provider": "OpenAI", "model": "gpt-4o-mini"}
        else:
            return {"provider": "Gemini", "model": "gemini-2.0-flash"}

    def parse_magic_prompt(self, text):
        current_time = datetime.datetime.now().isoformat()
        current_month = datetime.datetime.now().strftime("%Y-%m")
        
        prompt = f"""
        Analyze the following text: "{text}"
        Current Date/Time: {current_time}
        Current Month: {current_month}

        Determine if the user wants to:
        1. Add a transaction (expense or income)
        2. Set a monthly budget for a category

        Return ONLY a JSON object.

        If it's a TRANSACTION, return:
        {{
            "intent": "transaction",
            "amount": number,
            "category": string (Food, Rent, Utilities, Transport, Groceries, Shopping, Entertainment, Travel, Health, Salary, Bonus, Investment, Other Income, Other),
            "type": "expense" or "income",
            "description": string,
            "date": "YYYY-MM-DDTHH:MM",
            "payment_source": "Cash" or "Bank" or null
        }}

        If it's a BUDGET, return:
        {{
            "intent": "budget",
            "category": string (Food, Rent, Utilities, Transport, Groceries, Shopping, Entertainment, Travel, Health, Other),
            "monthly_limit": number,
            "adjustment": "increase" or "decrease" or null,
            "month": "YYYY-MM"
        }}

        INSTRUCTIONS:
        - For Vietnamese currency, strictly handle these suffixes:
          * "ngàn", "nghìn", "k" -> multiply by 1,000 (e.g., "3 ngàn" -> 3000)
          * "triệu", "tr", "m" -> multiply by 1,000,000 (e.g., "3 triệu" -> 3000000)
          * "tỷ" -> multiply by 1,000,000,000 (e.g., "3 tỷ" -> 3000000000)
          * "rưỡi" -> adds half of the preceding unit (e.g., "3 triệu rưỡi" -> 3500000)
        - Payment Source Detection:
          * If user mentions "tiền mặt", "cash", "ví" -> set payment_source to "Cash"
          * If user mentions "chuyển khoản", "ck", "bank", "ngân hàng", "thẻ", "card" -> set payment_source to "Bank"
        - For budget adjustments:
          * If user says "tăng thêm", "thêm vào", "cộng thêm", "increase", "add" -> set adjustment to "increase"
          * If user says "giảm bớt", "giảm đi", "bớt đi", "decrease", "reduce" -> set adjustment to "decrease"
          * If user says "giảm xuống còn", "chỉ còn", "set thành", "tăng lên mức", "đổi thành" -> set adjustment to null
        - Examples:
          * "35 triệu" -> 35000000
          * "tăng thêm 500k cho food" -> amount: 500000, category: Food, adjustment: "increase"
          * "giảm 200 ngàn budget shopping" -> amount: 200000, category: Shopping, adjustment: "decrease"
          * "giảm food xuống còn 1 triệu" -> amount: 1000000, category: Food, adjustment: null
          * "ăn tối 500k tiền mặt" -> amount: 500000, category: Food, type: expense, payment_source: "Cash"
          * "chuyển khoản 2tr tiền nhà" -> amount: 2000000, category: Rent, type: expense, payment_source: "Bank"
        - Return the full numeric value as a number.
        - For transactions, if relative dates (tomorrow, etc.) are used, calculate the exact date.
        - For budgets, if no month is specified, use the Current Month.
        - If the text is neither, return {{ "error": "Could not understand your request" }}
        """
        
        provider = self.get_active_provider()
        try:
            if provider == "openai":
                if not self.openai_client: return {"error": "OpenAI not configured"}
                response = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are a specialized financial assistant. Always return valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"}
                )
                content = response.choices[0].message.content.strip()
            else:
                if not self.gemini_model: return {"error": "Gemini not configured"}
                response = self.gemini_model.generate_content(prompt)
                content = response.text.replace('```json', '').replace('```', '').strip()
            
            return json.loads(content)
        except Exception as e:
            return {"error": str(e)}

    def parse_transaction(self, text):
        # Backward compatibility
        result = self.parse_magic_prompt(text)
        if result.get('intent') == 'budget':
            return {"error": "Only transactions are supported on this endpoint"}
        return result


