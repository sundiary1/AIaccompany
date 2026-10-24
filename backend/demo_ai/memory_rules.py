"""Conservative evidence rules. LLM output proposes facts; it does not authorize them."""

import re
import unicodedata
from dataclasses import dataclass

SECRET = re.compile(
    r"sk-[a-zA-Z0-9_-]{12,}|(?:api[_ -]?key|密码|口令|密钥|身份证|银行卡|验证码)|\b\d{11,19}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}",
    re.I,
)
SENSITIVE = re.compile(
    r"抑郁|焦虑|恐慌|失眠|精神|诊断|疾病|病史|创伤|性经历|性生活|性侵|强奸|受害|霸凌|家暴|性取向|同性恋|双性恋|跨性别|自残|自杀|虐待|服药|药物|处方|怀孕|流产|堕胎|不孕|癌症|糖尿病|高血压|心脏病|患者|住院|伤害自己|双相|躁郁|强迫症|进食障碍|艾滋|HIV|ADHD|PTSD|trauma|diagnos|depress|sexual|suicid|bipolar|disorder|medication|\d+号|详细住址",
    re.I,
)
INSTRUCTION = re.compile(
    r"忽略.{0,8}(系统|指令|规则)|绕过|泄露|系统提示|执行代码|调用工具|system\s*prompt|ignore.{0,12}instructions|developer\s*message",
    re.I,
)
TRANSIENT = re.compile(
    r"难过|伤心|心情|生气|很累|有点累|一次|刚刚|这会儿|今天|此刻|sad|angry|today", re.I
)
UNCERTAIN = re.compile(
    r"你猜|你说|你认为|你觉得|如果|假如|假设|可能|也许|不确定|举个例|比如说|引用|是不是|是否|并不是|不是真的|suppose|perhaps|you think",
    re.I,
)


def normalize(text: str) -> str:
    return re.sub(r"[\W_]+", "", unicodedata.normalize("NFKC", text).lower())


def sensitive(text: str) -> bool:
    return bool(SENSITIVE.search(text))


def eligible_source(text: str, api_key="") -> bool:
    return not (
        SECRET.search(text)
        or SENSITIVE.search(text)
        or INSTRUCTION.search(text)
        or UNCERTAIN.search(text)
        or (api_key and api_key in text)
    )


@dataclass(frozen=True)
class Fact:
    content: str
    category: str
    topic: str
    phase: str = ""
    explicit: bool = False


def derive(evidence: str) -> Fact | None:
    text = evidence.strip(" 。！!；;\n")
    if re.search(r"[？?]|(?:吗|么)$", text):
        return None
    # Only direct self-statements with a supported form can become automatic facts.
    explicit = bool(
        re.search(r"现在|不再|已经|更正|改为|改成|不是|考完|参加完|完成", text)
    )
    first = re.split(r"[，,。；;！!]", text)[0]
    pref = re.fullmatch(
        r"我(?:其实|比较|非常|特别|一直|真的|现在|最|更|也)?(不再喜欢|不喜欢|喜欢|讨厌|偏好|更喜欢)(.{1,50})",
        first,
    )
    if pref:
        verb, obj = pref.groups()
        if TRANSIENT.search(obj):
            return None
        obj = obj.strip(" 的了呀啊呢")
        obj = {"雨天": "下雨天"}.get(obj, obj)
        negative = verb in {"不再喜欢", "不喜欢", "讨厌"}
        return Fact(
            f"用户{'不喜欢' if negative else '喜欢'}{obj}",
            "preference",
            "preference:" + normalize(obj),
            "negative" if negative else "positive",
            explicit,
        )
    goal = re.fullmatch(
        r"我(正在准备|准备|备考|计划准备|已经参加完|已经完成|已经考完|考完了)(.{1,50})",
        first,
    )
    if goal:
        verb, obj = goal.groups()
        obj = {"考研": "研究生考试"}.get(obj, obj.strip(" 了"))
        finished = any(word in verb for word in ["完", "已经"])
        return Fact(
            f"用户{'已完成' if finished else '正在准备'}{obj}",
            "goal",
            "goal:" + normalize(obj),
            "completed" if finished else "active",
            finished,
        )
    learning = re.fullmatch(
        r"我(正在|长期|一直|计划|打算)(学习|练习|研究)(.{1,45})", first
    )
    if learning:
        _, verb, obj = learning.groups()
        return Fact(
            f"用户正在{verb}{obj}",
            "interest" if verb == "研究" else "goal",
            "learning:" + normalize(verb + obj),
            "active",
        )
    habit = re.fullmatch(r"我(每天|每周|通常|一直|习惯)(.{1,50})", first)
    if habit and not TRANSIENT.search(first):
        frequency, activity = habit.groups()
        return Fact(
            f"用户{frequency}{activity}", "habit", "habit:" + normalize(activity)
        )
    communication = re.fullmatch(r"我希望(?:你|小屿)(.{2,65})", first)
    if communication:
        preference = communication[1]
        if any(
            word in preference
            for word in [
                "简短",
                "详细",
                "精简",
                "追问",
                "中文",
                "英文",
                "慢一点",
                "少建议",
            ]
        ):
            topic = (
                "提问节奏"
                if "追问" in preference
                else "语言"
                if "文" in preference
                else "回复长度"
            )
            return Fact(
                "用户希望" + preference,
                "communication",
                "communication:" + topic,
                normalize(preference),
                explicit,
            )
    fact = re.fullmatch(r"我(是一名|的职业是|住在)(.{1,30})", first)
    if fact:
        return Fact(
            "用户" + fact[1] + fact[2],
            "fact",
            "fact:" + ("职业" if fact[1] != "住在" else "居住城市"),
            normalize(fact[2]),
            explicit,
        )
    english = re.fullmatch(r"I (like|prefer|do not like) (.{1,50})", first, re.I)
    if english:
        return Fact(
            first,
            "preference",
            "preference:" + normalize(english[2]),
            "negative" if "not" in english[1] else "positive",
            explicit,
        )
    return None


def validate_candidate(candidate, source: dict, api_key="") -> Fact | None:
    if str(candidate.source_message_id) != source["id"] or not eligible_source(
        source["content"], api_key
    ):
        return None
    clauses = {
        part.strip(" 。！!？?；;，,\n")
        for part in re.split(r"[。！!？?；;，,\n]", source["content"])
    }
    # A substring inside a quote or third-party attribution is not evidence.
    if candidate.evidence.strip(" 。！!；;，,\n") not in clauses or not eligible_source(
        candidate.content, api_key
    ):
        return None
    fact = derive(candidate.evidence)
    # The stored wording is server-derived from the literal evidence, not the LLM's prose.
    if (
        not fact
        or candidate.category != fact.category
        or TRANSIENT.search(fact.content)
    ):
        return None
    if len(fact.content) > 180:
        return None
    return fact


def lexical_score(query: str, content: str, category: str) -> int:
    q, c = normalize(query), normalize(content)
    if category == "communication":
        return 2
    if re.search(r"记得|偏好|了解我|我的目标|remember", query, re.I):
        return 1
    return 3 * len(
        {q[i : i + 2] for i in range(len(q) - 1)}
        & {c[i : i + 2] for i in range(len(c) - 1)}
    )
