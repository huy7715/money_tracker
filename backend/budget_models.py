from dataclasses import dataclass
from datetime import datetime

@dataclass
class Budget:
    category: str
    monthly_limit: float
    month: str  # Format: YYYY-MM
    id: int = None
    
    def __post_init__(self):
        if self.month is None:
            self.month = datetime.now().strftime("%Y-%m")
