"""Send a short Telegram message to staff when a new lead or mock registration arrives.

Needs two environment variables (Vercel -> Project Settings -> Environment Variables):
  TELEGRAM_BOT_TOKEN  the token BotFather gave you
  TELEGRAM_CHAT_ID    the chat (or group) the bot should write to
If either is missing nothing is sent. A Telegram problem never breaks a registration:
the message is sent only after the row is saved, and every error is swallowed.
"""
import json
import logging
import os
import urllib.request
from zoneinfo import ZoneInfo

from django.db import transaction

logger = logging.getLogger(__name__)
TASHKENT = ZoneInfo("Asia/Tashkent")
TIMEOUT_SECONDS = 3

COURSE_LABELS = {
    "ielts": "IELTS Preparation",
    "general": "General English",
    "advanced": "Advanced English",
    "kids": "Kids English",
    "unsure": "Не знает — помочь выбрать",
}
SOURCE_LABELS = {"course_card": "кнопка «Записаться» на курсе", "apply_form": "форма «Оставить заявку»"}
TIME_LABELS = {"morning": "утро", "day": "день", "evening": "вечер"}
PAY_LABELS = {"click": "Click", "payme": "Payme", "cash": "наличные в центре"}


def send_message(text):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        return False
    try:
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=json.dumps({"chat_id": chat_id, "text": text, "disable_web_page_preview": True}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as res:
            return 200 <= res.status < 300
    except Exception as e:  # never let Telegram break a registration
        logger.warning("Telegram message not sent: %s", e.__class__.__name__)
        return False


def send_after_commit(text):
    """Send once the database transaction is saved (immediately if there is none)."""
    transaction.on_commit(lambda: send_message(text))


def trial_lead_text(lead):
    lines = [
        "🆕 Новая заявка на пробный урок",
        f"Имя: {lead.full_name}",
        f"Телефон: {lead.phone}",
        f"Курс: {COURSE_LABELS.get(lead.course, lead.course)}",
        f"Источник: {SOURCE_LABELS.get(lead.source, lead.source or '—')}",
    ]
    if lead.preferred_time:
        lines.append(f"Удобное время: {TIME_LABELS.get(lead.preferred_time, lead.preferred_time)}")
    if lead.comment:
        lines.append(f"Комментарий: {lead.comment}")
    return "\n".join(lines)


def exam_registration_text(reg):
    exam = reg.exam
    when = exam.exam_date.astimezone(TASHKENT).strftime("%d.%m.%Y %H:%M") if exam else "—"
    return "\n".join([
        "📝 Запись на IELTS CD Mock Exam",
        f"Имя: {reg.full_name}",
        f"Телефон: {reg.phone}",
        f"Экзамен: {exam.title if exam else '—'} — {when}",
        f"Билет: {reg.ticket_no or '—'}",
        f"Оплата: {PAY_LABELS.get(reg.payment_method, reg.payment_method or '—')} (ожидает подтверждения)",
        "Источник: сайт, mock.html",
    ])
