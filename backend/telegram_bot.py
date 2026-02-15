"""
Telegram Bot Service for Money Tracker
Allows users to record transactions via Telegram messages
"""

import os
import asyncio
import logging
import tempfile
from datetime import datetime
from telegram import Update, BotCommand
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Import Money Tracker services
from .manager import FinanceManager
from .ai_service import AIService

# Initialize services
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
manager = FinanceManager(db_path=os.path.join(ROOT_DIR, 'money_tracker.db'))
ai_service = AIService()

# OpenAI client for Whisper speech-to-text
openai_client = None
if os.getenv("OPENAI_API_KEY"):
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def format_vnd(amount: float) -> str:
    """Format number as VND currency"""
    return f"{amount:,.0f}₫".replace(",", ".")


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command"""
    welcome_msg = """
🎉 *Chào mừng đến Money Tracker Bot!*

Tôi giúp bạn ghi chép thu chi mọi lúc mọi nơi.

📝 *Cách sử dụng:*
• Nhắn text: `cafe 30k`, `lương 20tr`
• 🎤 Gửi voice: Nói "cà phê ba mươi nghìn"
• Đặt budget: `set food budget 5m`

📊 *Các lệnh:*
/balance - Xem số dư tháng này
/report - Báo cáo chi tiêu theo category
/budget - Trạng thái budget
/help - Xem hướng dẫn

Hãy thử nhắn: `ăn sáng 50k` 🍜
"""
    await safe_reply(update, welcome_msg)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command"""
    help_msg = """
📖 *Hướng dẫn sử dụng*

*Ghi chi tiêu:*
• `cafe 30k` → Ghi 30,000₫ Food
• `grab đi làm 50k` → 50,000₫ Transport
• `mua sách 200k` → 200,000₫ Shopping

*Ghi thu nhập:*
• `lương 15m` → Thu nhập 15,000,000₫
• `thưởng 2tr` → Bonus 2,000,000₫

*Đặt ngân sách:*
• `set food budget 3m`
• `tăng thêm 500k budget food`

🎤 *Voice Input:*
• Gửi tin nhắn thoại, AI sẽ tự động nhận diện!

*Các lệnh:*
/balance - Số dư tháng này
/report - Báo cáo chi tiêu
/budget - Trạng thái budget
/month 2026-01 - Xem tháng cụ thể
"""
    await safe_reply(update, help_msg)


async def balance_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /balance command"""
    current_month = datetime.now().strftime("%Y-%m")
    
    # Check for month argument
    if context.args and len(context.args) > 0:
        current_month = context.args[0]
    
    balance = manager.get_balance(current_month)
    all_time = manager.get_all_time_stats()
    
    month_name = datetime.strptime(current_month, "%Y-%m").strftime("%B %Y")
    
    msg = f"""
💰 *Số dư {month_name}*

📊 Tháng này: *{format_vnd(balance)}*

📈 Tổng thu (all time): {format_vnd(all_time['income'])}
📉 Tổng chi (all time): {format_vnd(all_time['expense'])}
"""
    await safe_reply(update, msg)


async def report_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /report command - Monthly spending breakdown"""
    current_month = datetime.now().strftime("%Y-%m")
    
    if context.args and len(context.args) > 0:
        current_month = context.args[0]
    
    report = manager.get_monthly_report(current_month)
    summary = report['summary']
    spending = report['spending_by_category']
    
    month_name = datetime.strptime(current_month, "%Y-%m").strftime("%B %Y")
    
    # Category emojis
    emojis = {
        'Food': '🍔', 'Rent': '🏠', 'Utilities': '💡', 'Transport': '🚗',
        'Groceries': '🛒', 'Shopping': '🛍️', 'Entertainment': '🎮',
        'Travel': '✈️', 'Health': '💪', 'Salary': '💵', 'Bonus': '🎁',
        'Investment': '📈', 'Other Income': '💰', 'Other': '📦', 'Savings': '🏦'
    }
    
    await safe_reply(update, msg)


async def budget_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /budget command - Budget status"""
    current_month = datetime.now().strftime("%Y-%m")
    status = manager.get_budget_status(current_month)
    
    if not status:
        await safe_reply(update, "📊 Chưa có budget nào được thiết lập.\n\nThử: `set food budget 3m`")
        return
    
    await safe_reply(update, msg)


async def month_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /month command - View specific month"""
    if not context.args or len(context.args) == 0:
        await safe_reply(update, "📅 Sử dụng: `/month 2026-01`")
        return
    
    month = context.args[0]
    # Redirect to balance with month
    context.args = [month]
    await balance_command(update, context)


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /status command - Health check"""
    uptime = "N/A" # Simple implementation for now
    status_msg = f"""
🤖 *Money Tracker Bot Status*
✅ *Service:* Running
📁 *Database:* Connected
🧠 *AI Provider:* {ai_service.get_active_provider().upper()}
⏰ *Current Time:* {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
"""
    await safe_reply(update, status_msg)


async def safe_reply(update: Update, text: str, parse_mode='Markdown'):
    """Safely reply to a message, catching potential network errors"""
    try:
        if update.message:
            await update.message.reply_text(text, parse_mode=parse_mode)
    except Exception as e:
        logger.error(f"Failed to send message: {e}")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle natural language messages for transactions and budgets"""
    text = update.message.text
    
    if not text or len(text.strip()) == 0:
        return
    
    # Show typing indicator
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action='typing')
    
    try:
        # Use AI service to parse the message
        result = ai_service.parse_magic_prompt(text)
        
        if 'error' in result:
            await safe_reply(update, f"❌ Không hiểu được: _{result['error']}_\n\nThử: `cafe 30k` hoặc `/help`")
            return
        
        intent = result.get('intent')
        
        if intent == 'transaction':
            # Add transaction
            amount = result.get('amount', 0)
            category = result.get('category', 'Other')
            tx_type = result.get('type', 'expense')
            description = result.get('description', text[:50])
            date = result.get('date')
            
            # Get asset_id from payment_source if provided
            asset_id = None
            payment_source = result.get('payment_source')
            if payment_source:
                assets = manager.get_assets()
                for asset in assets:
                    if asset['type'] == payment_source or asset['name'].lower() == payment_source.lower():
                        asset_id = asset['id']
                        break
            
            manager.add_transaction(
                amount=amount,
                category=category,
                type=tx_type,
                description=description,
                date=date,
                asset_id=asset_id
            )
            
            # Emoji based on type
            emoji = "💸" if tx_type == 'expense' else "💰"
            type_text = "Chi" if tx_type == 'expense' else "Thu"
            source_text = f" từ {payment_source}" if payment_source else ""
            
            await update.message.reply_text(
                f"{emoji} *Đã ghi {type_text}:* {format_vnd(amount)}\n"
                f"📁 Danh mục: {category}\n"
                f"📝 Mô tả: {description}{source_text}",
                parse_mode='Markdown'
            )
            
        elif intent == 'budget':
            # Set/adjust budget
            category = result.get('category', 'Other')
            monthly_limit = result.get('monthly_limit', 0)
            adjustment = result.get('adjustment')
            month = result.get('month')
            
            if adjustment == 'increase':
                manager.adjust_budget(category, monthly_limit, month)
                await update.message.reply_text(
                    f"📈 Đã tăng budget *{category}* thêm {format_vnd(monthly_limit)}",
                    parse_mode='Markdown'
                )
            elif adjustment == 'decrease':
                manager.adjust_budget(category, -monthly_limit, month)
                await update.message.reply_text(
                    f"📉 Đã giảm budget *{category}* đi {format_vnd(monthly_limit)}",
                    parse_mode='Markdown'
                )
            else:
                manager.set_budget(category, monthly_limit, month)
                await update.message.reply_text(
                    f"✅ Đã đặt budget *{category}*: {format_vnd(monthly_limit)}/tháng",
                    parse_mode='Markdown'
                )
        else:
            await safe_reply(update, "🤔 Tôi chưa hiểu ý bạn.\n\nThử: `cafe 30k` hoặc `/help`")
            
    except Exception as e:
        logger.error(f"Error processing message: {e}")
        await safe_reply(update, f"❌ Có lỗi xảy ra: {str(e)[:100]}")


async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle voice messages - transcribe with Whisper and process"""
    if not openai_client:
        await safe_reply(update, "❌ Voice input không khả dụng (thiếu OpenAI API key)")
        return
    
    # Show typing indicator
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action='typing')
    
    try:
        # Get voice file
        voice = update.message.voice or update.message.audio
        if not voice:
            return
        
        # Download voice file
        file = await context.bot.get_file(voice.file_id)
        
        # Create temp file
        with tempfile.NamedTemporaryFile(suffix='.ogg', delete=False) as tmp:
            tmp_path = tmp.name
        
        # Download to temp file
        await file.download_to_drive(tmp_path)
        
        # Transcribe with Whisper
        await safe_reply(update, "🎤 Đang nhận diện giọng nói...")
        
        with open(tmp_path, 'rb') as audio_file:
            transcript = openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="vi"  # Vietnamese
            )
        
        # Clean up temp file
        os.unlink(tmp_path)
        
        text = transcript.text.strip()
        
        if not text:
            await safe_reply(update, "❌ Không nhận diện được giọng nói. Hãy thử lại.")
            return
        
        # Show what was heard
        await safe_reply(update, f"🎧 Đã nghe: _{text}_")
        
        # Process the transcribed text using AI service (same as text message)
        result = ai_service.parse_magic_prompt(text)
        
        if 'error' in result:
            await safe_reply(update, f"❌ Không hiểu được: _{result['error']}_")
            return
        
        intent = result.get('intent')
        
        if intent == 'transaction':
            amount = result.get('amount', 0)
            category = result.get('category', 'Other')
            tx_type = result.get('type', 'expense')
            description = result.get('description', text[:50])
            date = result.get('date')
            
            # Get asset_id from payment_source
            asset_id = None
            payment_source = result.get('payment_source')
            if payment_source:
                assets = manager.get_assets()
                for asset in assets:
                    if asset['type'] == payment_source or asset['name'].lower() == payment_source.lower():
                        asset_id = asset['id']
                        break
            
            manager.add_transaction(
                amount=amount,
                category=category,
                type=tx_type,
                description=description,
                date=date,
                asset_id=asset_id
            )
            
            emoji = "💸" if tx_type == 'expense' else "💰"
            type_text = "Chi" if tx_type == 'expense' else "Thu"
            source_text = f" từ {payment_source}" if payment_source else ""
            
            await update.message.reply_text(
                f"{emoji} *Đã ghi {type_text}:* {format_vnd(amount)}\n"
                f"📁 Danh mục: {category}\n"
                f"📝 Mô tả: {description}{source_text}",
                parse_mode='Markdown'
            )
            
        elif intent == 'budget':
            category = result.get('category', 'Other')
            monthly_limit = result.get('monthly_limit', 0)
            adjustment = result.get('adjustment')
            month = result.get('month')
            
            if adjustment == 'increase':
                manager.adjust_budget(category, monthly_limit, month)
                await update.message.reply_text(
                    f"📈 Đã tăng budget *{category}* thêm {format_vnd(monthly_limit)}",
                    parse_mode='Markdown'
                )
            elif adjustment == 'decrease':
                manager.adjust_budget(category, -monthly_limit, month)
                await update.message.reply_text(
                    f"📉 Đã giảm budget *{category}* đi {format_vnd(monthly_limit)}",
                    parse_mode='Markdown'
                )
            else:
                manager.set_budget(category, monthly_limit, month)
                await update.message.reply_text(
                    f"✅ Đã đặt budget *{category}*: {format_vnd(monthly_limit)}/tháng",
                    parse_mode='Markdown'
                )
        else:
            await safe_reply(update, "🤔 Tôi chưa hiểu ý bạn.\n\nThử nói: \"cà phê ba mươi nghìn\"")
            
    except Exception as e:
        logger.error(f"Error processing voice: {e}")
        await safe_reply(update, f"❌ Lỗi xử lý voice: {str(e)[:100]}")


async def post_init(application: Application):
    """Set bot commands menu"""
    commands = [
        BotCommand("start", "Bắt đầu sử dụng bot"),
        BotCommand("balance", "Xem số dư tháng này"),
        BotCommand("report", "Báo cáo chi tiêu"),
        BotCommand("budget", "Trạng thái budget"),
        BotCommand("month", "Xem tháng cụ thể (VD: /month 2026-01)"),
        BotCommand("status", "Kiểm tra tình trạng bot"),
        BotCommand("help", "Hướng dẫn sử dụng"),
    ]
    await application.bot.set_my_commands(commands)


def run_bot():
    """Start the Telegram bot with polling"""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN not found in environment variables!")
        return
    
    logger.info("Starting Money Tracker Telegram Bot...")
    
    # Create application
    application = Application.builder().token(token).post_init(post_init).build()
    
    # Add handlers
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("balance", balance_command))
    application.add_handler(CommandHandler("report", report_command))
    application.add_handler(CommandHandler("budget", budget_command))
    application.add_handler(CommandHandler("month", month_command))
    application.add_handler(CommandHandler("status", status_command))
    
    # Handle all text messages
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    # Handle voice messages
    application.add_handler(MessageHandler(filters.VOICE | filters.AUDIO, handle_voice))
    
    # Start polling
    logger.info("Bot is running! Press Ctrl+C to stop.")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    run_bot()
