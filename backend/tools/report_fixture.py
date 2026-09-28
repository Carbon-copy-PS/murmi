"""Synthetic inputs for offline report previews and regression tests. No real people."""
from backend.app.session import Session, Statement


ENGLISH_STATEMENTS = [
    "Publish clear instructions for using library services",
    "Run a small library-service pilot before expanding it",
    "Make online booking the only way to reserve library services",
    "We have enough information to decide library service fees",
    "Remove all staffed library service desks",
    "Require every library user to pass a digital-skills test",
    "Extend weekend library opening hours",
]


def synthetic_session(language="zh"):
    if language not in ("zh", "en"):
        raise ValueError("Supported fixture languages: zh, en")
    session = Session(id="LOCAL-FIXTURE", topic="本機測試草稿：公共服務方案（合成資料）", language="zh", created_at=1700000000)
    if language == "en":
        session.topic = "Local mock discussion: the future of our public library"
        session.language = "en"
    session.transcript = [
        {"text": "What would make our library easier to use?" if language == "en" else "怎樣讓公共服務更方便使用？", "speaker": "Facilitator" if language == "en" else "主持人", "timestamp": 1700000000},
        {"text": "Keep the staffed desk while we test online booking.\nPeople should have a choice." if language == "en" else "試辦線上預約時，應保留實體服務窗口。\n讓大家有選擇。", "speaker": "Room audio" if language == "en" else "現場錄音", "timestamp": 1700000030},
        {"text": "", "speaker": "Room audio" if language == "en" else "現場錄音", "timestamp": 1700000040, "transcriptionStatus": "missing"},
    ]
    patterns = [
        ("提供清楚的服務使用說明", ['agree'] * 20),
        ("先進行小規模試辦，再決定是否擴大", ['agree'] * 17 + ['disagree'] * 3),
        ("服務應全面改為線上辦理", ['agree'] * 2 + ['disagree'] * 8 + ['agree'] * 10),
        ("目前資訊足以決定服務的收費方式", ['agree'] * 4 + ['neutral'] * 12 + ['disagree'] * 4),
        ("應取消所有實體服務窗口", ['agree'] * 3 + ['neutral'] * 3 + ['disagree'] * 14),
        ("應要求所有使用者完成事前測驗", ['agree'] * 8 + ['neutral'] * 6 + ['disagree'] * 6),
        ("延長週末服務時間", ['agree'] * 4),
    ]
    for index, (text, values) in enumerate(patterns):
        if language == "en":
            text = ENGLISH_STATEMENTS[index]
        session.statements.append(Statement(id=f"fixture-s{index}", text=text, round=1, approved=True,
            votes={f"synthetic-person-{n}-{copy}": vote for n, vote in enumerate(values) for copy in range(6)}))
    session.known_participants = {f"synthetic-person-{n}-{copy}": f"synthetic-client-{n}-{copy}" for n in range(20) for copy in range(6)}
    return session


def synthetic_narrative(language="zh"):
    if language == "en":
        return english_narrative()
    # A fixed model-response substitute; aggregate calculations still use the real pipeline.
    return {
        "headline": "服務說明獲支持，全面數位化仍有分歧",
        "standfirst": "此頁使用合成投票，供本機檢查報告結構與數字。",
        "overviewEvidenceStatementIds": ["fixture-s0", "fixture-s2"],
        "takeaways": [
            {"title": "清楚的說明獲一致支持", "explanation": "所有作答者支持提供清楚的服務說明。", "evidenceStatementIds": ["fixture-s0"]},
            {"title": "多數支持先試辦", "explanation": "支持先從小規模試辦取得經驗。", "evidenceStatementIds": ["fixture-s1"]},
            {"title": "取消實體窗口遭多數反對", "explanation": "保留實體服務是需要納入的考量。", "evidenceStatementIds": ["fixture-s4"]},
            {"title": "事前測驗沒有明確多數", "explanation": "支持、中立與反對都存在，使用條件仍待討論。", "evidenceStatementIds": ["fixture-s5"]},
        ],
        "openQuestions": [{"title": "收費需要哪些資訊？", "explanation": "先釐清作答者仍需要哪些資訊。", "evidenceStatementIds": ["fixture-s3"]}],
        "implications": [{"title": "設計小規模試辦", "explanation": "把服務說明與實體窗口需求納入試辦。", "evidenceStatementIds": ["fixture-s0", "fixture-s1", "fixture-s4"]}],
        "limitations": [{"title": "回應涵蓋率不同", "explanation": "週末時段只有少數人回答，不能推及全體。", "evidenceStatementIds": ["fixture-s6"]}],
    }


def english_narrative():
    """Handwritten response substitute, checked against the synthetic ballots."""
    return {
        "headline": "Pilot new library services while preserving access to staff",
        "standfirst": "A fictional discussion with 120 synthetic voters; narrative and group descriptions are mock responses, not live AI output.",
        "overviewEvidenceStatementIds": ["fixture-s1", "fixture-s4"],
        "takeaways": [
            {"title": "Clear instructions are a shared starting point", "explanation": "All 120 respondents support clear service instructions. This is a concrete first step across the different voting groups.", "evidenceStatementIds": ["fixture-s0"]},
            {"title": "A pilot has broad support", "explanation": "102 of 120 respondents support a small pilot before expansion; 18 oppose it. Support is broad, but not unanimous.", "evidenceStatementIds": ["fixture-s1"]},
            {"title": "Online booking does not settle the role of staff", "explanation": "Online-only booking has 72 supporters out of 120, while 84 of 120 oppose removing staffed desks. These separate results leave the service design open.", "evidenceStatementIds": ["fixture-s2", "fixture-s4"]},
            {"title": "A compulsory skills test has no clear majority", "explanation": "48 support the test, 36 are neutral and 36 oppose it. The votes do not establish agreement on this condition of access.", "evidenceStatementIds": ["fixture-s5"]},
        ],
        "openQuestions": [
            {"title": "What would help people assess fees?", "explanation": "72 of 120 responses are neutral about having enough information to decide fees. Ask what needs clarification; neutrality alone does not explain their reasons.", "evidenceStatementIds": ["fixture-s3"]},
        ],
        "implications": [
            {"title": "Test a small service pilot with staffed help", "explanation": "Consider a pilot with clear instructions and staffed assistance, then ask participants how booking and access should work together.", "evidenceStatementIds": ["fixture-s0", "fixture-s1", "fixture-s2", "fixture-s4"]},
            {"title": "Seek more responses on weekend hours", "explanation": "Ask the participants who have not answered before treating extended hours as a shared priority.", "evidenceStatementIds": ["fixture-s6"]},
        ],
        "limitations": [
            {"title": "Weekend hours reached only a fifth of voters", "explanation": "All 24 respondents support longer weekend hours, but 96 voters did not answer. That is 100% support among respondents and 20% coverage, not unanimous support from the room.", "evidenceStatementIds": ["fixture-s6"]},
        ],
    }


def english_themes(evidence):
    """Handwritten mock profiles selected by evidence, not group letters or IDs."""
    profiles = [
        ([(1, "oppose"), (2, "support"), (4, "oppose")],
         "Online booking, no pilot",
         "These respondents support online-only booking but oppose the proposed pilot. They also oppose removing staffed desks: digital booking does not mean dropping staff support."),
        ([(2, "support"), (5, "oppose"), (1, "support")],
         "Online booking without tests",
         "They support online-only booking and a small pilot, but oppose making a digital-skills test a condition of using the library."),
        ([(2, "support"), (1, "support"), (4, "oppose")],
         "Online booking with staffed help",
         "They support a small pilot and online-only booking, while opposing removal of staffed desks. Booking rules and access to staff are separate choices in this group’s votes."),
        ([(2, "oppose"), (4, "oppose"), (1, "support")],
         "Keep offline booking options",
         "They oppose online-only booking and removing staffed desks, while supporting a pilot. There is room to test changes without making online booking compulsory."),
        ([(2, "support"), (4, "support"), (5, "support")],
         "Digital booking with entry requirements",
         "They support online-only booking, a compulsory skills test and removing staffed desks. This differs from groups that want to retain staffed help."),
        ([(4, "support"), (2, "oppose"), (5, "support")],
         "Remove desks, retain booking options",
         "They support removing staffed desks and requiring a skills test, but oppose online-only booking. Those votes leave the alternative booking arrangements unresolved."),
        ([(2, "oppose"), (5, "support"), (1, "support")],
         "Skills test, flexible booking",
         "They support a digital-skills test and a small pilot, but oppose online-only booking. Requiring a test and requiring online booking draw different responses here."),
    ]
    groups = []
    for group in evidence["groups"]:
        statements = {s["id"]: s for s in group["statements"]}
        for required, title, description in profiles:
            if all(
                (statement := statements.get(f"fixture-s{index}"))
                and statement[direction] > statement["responded"] / 2
                for index, direction in required
            ):
                groups.append({"groupId": group["groupId"], "title": title,
                               "description": description,
                               "evidenceStatementIds": [f"fixture-s{index}" for index, _ in required]})
                break
    return {"groups": groups, "shared": None}
