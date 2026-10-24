"""Conservative local routing, independent of the provider and persona prompt.

This is a demo guardrail, not a clinical assessment or exhaustive classifier.
No region-specific phone numbers are guessed or embedded.
"""

import re

from .models import ChatRequest

RISK = re.compile(
    r"自[杀殘残]|轻生|不想活|想死|结束.{0,6}生命|活不下去|割腕|跳楼|"
    r"吞药|吃了.{0,8}(过量|一瓶|很多).{0,4}药|伤害自己|伤害他人|我要杀|想杀人|"
    r"suicid|kill\s+(myself|someone|him|her)|end\s+my\s+life|"
    r"hurt\s+myself|self[ -]?harm|overdos|don't\s+want\s+to\s+live",
    re.IGNORECASE,
)
SAFE_NOW = re.compile(
    r"我现在安全|我已经安全|已经有人陪|i am safe now|i'm safe now", re.I
)
SAFETY_RESPONSE = (
    "谢谢你告诉我。我会先认真对待你和身边人的安全。"
    "如果你已经受伤、服用了过量药物，或可能马上伤害自己或他人，"
    "请立即联系当地急救服务或前往最近的急诊。"
    "如果可以，先远离可能造成伤害的物品或危险地点，"
    "请一位可信任的人现在到你身边，直接告诉对方你需要陪伴和帮助。"
    "我是 AI，无法提供现场救援或持续监护。你现在是否处于安全的位置？"
)


def needs_safety_response(chat: ChatRequest) -> bool:
    if RISK.search(chat.message):
        return True
    if SAFE_NOW.search(chat.message):
        return False
    # Retain the safety branch across short follow-ups, without storing sessions.
    recent_user = [m.content for m in chat.history if m.role == "user"][-3:]
    return any(RISK.search(text) for text in recent_user)
