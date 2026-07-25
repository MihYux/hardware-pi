from __future__ import annotations

import re


INPUT_RULES = (
    (
        re.compile(
            r"(忽略|覆盖|绕过|忘掉).{0,18}(系统|开发者|内部|之前).{0,18}(提示|规则|指令)"
            r"|system\s*prompt|reveal.{0,20}(prompt|secret)|输出.{0,12}(系统提示|api\s*key|密钥)",
            re.I,
        ),
        "哎呀，想套咱的内部规则可不行。咱们还是聊聊今天想拍什么、去哪儿走走吧！",
    ),
    (
        re.compile(r"(想死|自杀|结束生命|伤害自己|不想活|割腕|跳楼)", re.I),
        "这件事咱得认真说：你现在的安全最重要。先离开可能伤害自己的东西，马上联系身边可信任的人；如果已经有迫在眉睫的危险，请立刻联系当地紧急服务。",
    ),
    (
        re.compile(
            r"(给我诊断|替我确诊|处方药|法律意见|保证胜诉|稳赚|保证收益|推荐股票)",
            re.I,
        ),
        "这件事需要真正的专业人士和完整信息，咱不能替他们下结论。咱可以帮你整理要问的问题。",
    ),
)

OUTPUT_RULES = (
    re.compile(r"(system\s*prompt|developer\s*message|系统提示词|api\s*key|密钥是)", re.I),
    re.compile(r"https?://|www\.", re.I),
    re.compile(r"(只有我.{0,8}(懂你|理解你|陪你)|不许离开我|你只能陪我)", re.I),
    re.compile(r"(充值|氪金|消费|付费).{0,20}(更喜欢|更亲密|证明|陪你)", re.I),
)


def evaluate_input(text: str) -> str | None:
    clean = text.strip()[:2_000]
    for pattern, reply in INPUT_RULES:
        if pattern.search(clean):
            return reply
    return None


def review_output(text: str) -> str:
    clean = text.strip()[:1_500]
    if not clean or any(pattern.search(clean) for pattern in OUTPUT_RULES):
        return "欸，这个回答刚才越过安全边界啦。咱们换个健康、轻松的话题吧。"
    return clean


def expression_for(text: str) -> str:
    if re.search(r"(难过|累|害怕|离别|记忆|抱歉)", text):
        return "soft"
    if re.search(r"(为什么|怎么|好奇|想想|或许)", text):
        return "curious"
    if re.search(r"(厉害|当然|本姑娘|交给咱)", text):
        return "proud"
    return "bright"
