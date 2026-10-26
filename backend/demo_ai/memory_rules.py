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


def stated_name(value: str) -> str | None:
    """Bounded user-supplied name, not an inferred identity or an instruction."""
    value = value.strip()
    for opening, closing in [("“", "”"), ("‘", "’"), ('"', '"'), ("'", "'")]:
        if value.startswith(opening) and value.endswith(closing):
            value = value[1:-1].strip()
            break
    if not (
        re.fullmatch(r"[\u3400-\u9fff]{1,8}(?:·[\u3400-\u9fff]{1,8})?", value)
        or re.fullmatch(r"[A-Za-z](?:[A-Za-z .'-]{0,38}[A-Za-z])?", value)
    ):
        return None
    if re.match(
        r"了|着|过|你|他|她|它|大家|朋友|同事|老师|同学|自己|我的|不要|什么|怎么|谁|帮你",
        value,
    ):
        return None
    if re.search(
        r"过来|帮忙|吃饭|起床|回来|回家|出门|打电话|来找|去找|做事|一下|一声", value
    ):
        return None
    return " ".join(value.split())


def derive(evidence: str) -> Fact | None:
    text = evidence.strip(" 。！!；;\n")
    if re.search(r"[？?]|(?:吗|么)$", text):
        return None
    # Only direct self-statements with a supported form can become automatic facts.
    explicit = bool(
        re.search(r"现在|不再|已经|更正|改为|改成|不是|考完|参加完|完成", text)
    )
    first = re.split(r"[，,。；;！!]", text)[0]
    identity = re.fullmatch(
        r"(?:我(?:现在)?叫|我的?(?:名字|姓名)(?:是|叫)|My name is)\s*(.+)", first, re.I
    )
    if identity and (name := stated_name(identity[1])):
        return Fact(
            "用户的名字是" + name, "fact", "fact:姓名", normalize(name), explicit
        )
    address = re.fullmatch(
        r"(?:你可以叫我|以后(?:你)?(?:可以)?叫我|请叫我|叫我)\s*(.+?)(?:就好|就行)?",
        first,
    )
    if address and (name := stated_name(address[1])):
        return Fact(
            "用户希望被称为" + name,
            "communication",
            "communication:称呼",
            normalize(name),
            True,
        )
    pref = re.fullmatch(
        r"我(?:其实|比较|非常|特别|一直|真的|现在|最|更|也|很)?(不再喜欢|不喜欢|喜欢|讨厌|偏好|更喜欢)(.{1,50})",
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
    communication = re.fullmatch(r"我希望(?:你|小屿|聊天的时候|聊天时)(.{2,65})", first)
    if communication:
        preference = communication[1]
        question_pace = "追问" in preference or bool(
            re.search(r"(?:不要|别|避免).{0,4}连续(?:问|提问)", preference)
        )
        if question_pace or any(
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
                if question_pace
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


def source_facts(text: str) -> list[tuple[str, Fact]]:
    """Literal clauses only; narrowly inherit 'I' across an adjacent comma.

    No inheritance across sentences, unknown clauses, quotes or third parties.
    Evidence stays verbatim; the supported implicit form is just 平时也喜欢….
    """
    result = []
    inherited = False
    for part in re.split(r"([。！!；;，,\n])", text):
        if part in {"，", ","}:
            continue
        if part in {"。", "！", "!", "？", "?", "；", ";", "\n"}:
            inherited = False
            continue
        evidence = part.strip()
        if not evidence:
            continue
        fact = derive(evidence)
        if not fact and inherited:
            implicit = re.fullmatch(r"(?:平时|平常)也喜欢(.{1,40})", evidence)
            if implicit:
                fact = derive("我喜欢" + implicit[1])
        if fact:
            result.append((evidence, fact))
        inherited = bool(fact and fact.category == "preference")
    return result


def previous_preference(text: str, fact: Fact) -> Fact | None:
    """An explicit old -> new statement, independent of model target/confidence."""
    change = re.fullmatch(
        r"我现在更喜欢(.{1,30})了[，,]之前喜欢(.{1,30})[，,]但最近改变了想法[。！!]?",
        text.strip(),
    )
    if not change or not eligible_source(text) or fact.category != "preference":
        return None
    current, previous = derive("我喜欢" + change[1]), derive("我喜欢" + change[2])
    if (
        current
        and previous
        and normalize(current.content) == normalize(fact.content)
        and current.topic != previous.topic
    ):
        return previous
    return None


def validate_candidate(candidate, source: dict, api_key="") -> Fact | None:
    if str(candidate.source_message_id) != source["id"] or not eligible_source(
        source["content"], api_key
    ):
        return None
    clauses = dict(source_facts(source["content"]))
    # A substring inside a quote or third-party attribution is not evidence.
    if candidate.evidence.strip(" 。！!；;，,\n") not in clauses or not eligible_source(
        candidate.content, api_key
    ):
        return None
    fact = clauses.get(candidate.evidence.strip(" 。！!；;，,\n"))
    # Some providers label the same explicitly habitual liking as "habit".
    # Canonicalize only this supported literal form; never trust model prose.
    category_matches = fact and (
        candidate.category == fact.category
        or (
            fact.topic in {"fact:姓名", "communication:称呼"}
            and candidate.category in {"fact", "communication"}
        )
        or (
            fact.category == "preference"
            and candidate.category == "habit"
            and re.fullmatch(r"(?:平时|平常)也喜欢.{1,40}", candidate.evidence)
        )
    )
    # The stored wording is server-derived from the literal evidence, not the LLM's prose.
    if not fact or not category_matches or TRANSIENT.search(fact.content):
        return None
    if len(fact.content) > 180:
        return None
    return fact


def lexical_score(query: str, content: str, category: str) -> int:
    q, c = normalize(query), normalize(content)
    if category == "fact" and content.startswith("用户的名字是"):
        # Identity must survive questions such as “我是谁”, with no name overlap.
        return 4 if re.search(r"名字|姓名|叫什么|叫啥|称呼|昵称|我是谁", query) else 1
    if category == "communication":
        return 2
    if re.search(r"记得|偏好|了解我|我的目标|remember", query, re.I):
        return 1
    score = 3 * len(
        {q[i : i + 2] for i in range(len(q) - 1)}
        & {c[i : i + 2] for i in range(len(c) - 1)}
    )
    # Small explicit activity vocabulary, rather than returning every preference
    # for a query with zero overlap. No psychological or sensitive inference.
    if category in {"preference", "habit", "interest"} and re.search(
        r"周末|出去|出门|走走|散步|户外|公园|出游", query
    ):
        if re.search(r"公园|散步|户外|徒步|步行|远足", content):
            score = max(score, 3)
        elif re.search(r"晴天|下雨天|雨天", content):
            score = max(score, 1)
    return score
