from dataclasses import dataclass
from datetime import datetime

@dataclass
class Transaction:
    amount: float
    category: str
    type: str  # 'income' or 'expense'
    description: str
    date: str = None
    id: int = None

    def __post_init__(self):
        if not self.date:
            self.date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

@dataclass
class Budget:
    category: str
    monthly_limit: float
    month: str = None  # Format: YYYY-MM
    id: int = None
    
    def __post_init__(self):
        if not self.month:
            self.month = datetime.now().strftime("%Y-%m")
