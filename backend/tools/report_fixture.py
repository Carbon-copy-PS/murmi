"""Synthetic inputs for offline report previews and regression tests. No real people."""
from backend.app.session import Session, Statement


def synthetic_session():
    session = Session(id="LOCAL-FIXTURE", topic="本機測試草稿：公共服務方案（合成資料）", language="zh", created_at=1700000000)
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
        session.statements.append(Statement(id=f"fixture-s{index}", text=text, round=1, approved=True,
            votes={f"synthetic-person-{n}-{copy}": vote for n, vote in enumerate(values) for copy in range(6)}))
    session.known_participants = {f"synthetic-person-{n}-{copy}": f"synthetic-client-{n}-{copy}" for n in range(20) for copy in range(6)}
    return session


def synthetic_narrative():
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
