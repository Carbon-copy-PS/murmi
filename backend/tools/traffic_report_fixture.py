"""A second, entirely fictional English discussion for offline report checks."""
from backend.app.session import Session, Statement


STATEMENTS = [
    "Keep step-free access to every town-centre shop",
    "Try a six-week pedestrian-only zone on Saturdays",
    "Make the Saturday pedestrian-only zone permanent now",
    "Ban private cars from the town centre on weekdays too",
    "Keep morning delivery access for local businesses",
    "Improve bus frequency before changing road access",
    "We have enough evidence to judge the effect on shop revenue",
    "Charge drivers to enter the town centre",
    "Hold monthly evening events in the pedestrian zone",
]


def traffic_session():
    session = Session(id="LOCAL-TRAFFIC-FIXTURE", language="en", created_at=1700000000,
                      topic="Local mock discussion: a more walkable town centre")
    # Three contrasting sets of ballots; their labels are never supplied to clustering.
    profiles = [
        ['agree', 'agree', 'agree', 'agree', 'agree', 'agree', 'neutral', 'agree'],
        ['agree', 'agree', 'neutral', 'disagree', 'agree', 'agree', 'neutral', 'disagree'],
        ['agree', 'disagree', 'disagree', 'disagree', 'agree', 'agree', 'disagree', 'neutral'],
    ]
    session.known_participants = {f"traffic-person-{g}-{i}": f"traffic-client-{g}-{i}"
                                  for g in range(3) for i in range(20)}
    for index, text in enumerate(STATEMENTS):
        votes = {f"traffic-person-{g}-{i}": (profile[index] if index < 8 else 'agree')
                 for g, profile in enumerate(profiles) for i in range(20 if index < 8 else 3)}
        session.statements.append(Statement(id=f"traffic-s{index}", text=text, round=1,
                                            approved=True, votes=votes))
    # Separate fictional reactions to the common-ground package, not inferred
    # endorsements from statement votes. Six of the 60 people did not react.
    session.common_ground_history = [{
        "id": "traffic-common-ground", "mode": "policy", "status": "endorsed",
        "groupStatement": "Keep step-free shop access, morning deliveries and better buses at the centre of any changes. A Saturday trial has majority support; permanent and weekday restrictions remain unresolved.",
        "recommendations": [{"id": "traffic-r1", "text": "Develop a six-week Saturday trial for further review."}],
        "essentialConditions": [{"id": "traffic-c1", "text": "Protect step-free access and morning deliveries, and improve bus frequency before changing road access."}],
        "unresolvedQuestions": [{"id": "traffic-u1", "text": "What evidence on shop revenue and access would justify a permanent change?"}],
        "participantVotes": {
            f"traffic-person-{g}-{i}": {"vote": "agree" if i < 16 else "disagree",
                                       **({"reason": "The trial still needs a clearer plan for delivery access."}
                                          if g == 0 and i == 16 else {})}
            for g in range(3) for i in range(18)
        },
        "endorsement": {"agree": 48, "disagree": 6, "total": 54,
                        "respondentCount": 54, "rosterSize": 60,
                        "remainingConcerns": [{"reason": "The trial still needs a clearer plan for delivery access."}]},
    }]
    return session


def traffic_narrative():
    """Reviewed mock prose, not a call to a model."""
    return {
        "headline": "A Saturday trial has support; permanent restrictions remain open",
        "standfirst": "A fictional discussion with 60 synthetic voters. Summary, common ground, reactions and group descriptions are mock data, not live AI output.",
        "overviewEvidenceStatementIds": ["traffic-s1", "traffic-s2"],
        "takeaways": [
            {"title": "Access needs are shared across the debate", "explanation": "All 60 respondents support step-free shop access, morning deliveries and better bus frequency before road-access changes.", "evidenceStatementIds": ["traffic-s0", "traffic-s4", "traffic-s5"]},
            {"title": "A trial attracts more support than permanence", "explanation": "40 of 60 support a six-week Saturday trial; 20 oppose it. Making it permanent now splits responses evenly: 20 support, 20 neutral and 20 opposed.", "evidenceStatementIds": ["traffic-s1", "traffic-s2"]},
            {"title": "Weekday restrictions face majority opposition", "explanation": "40 of 60 oppose a weekday ban on private cars; 20 support it. Saturday-trial support should not be read as support for restrictions throughout the week.", "evidenceStatementIds": ["traffic-s3", "traffic-s1"]},
            {"title": "An entry charge has no clear majority", "explanation": "20 respondents support charging drivers, 20 are neutral and 20 oppose it. The votes leave this funding option unresolved.", "evidenceStatementIds": ["traffic-s7"]},
        ],
        "openQuestions": [
            {"title": "What evidence is needed on shop revenue?", "explanation": "40 are neutral about having enough evidence and 20 disagree. Ask what would help them judge the effect; neutral votes alone do not reveal why people chose them.", "evidenceStatementIds": ["traffic-s6"]},
        ],
        "implications": [
            {"title": "Develop a limited Saturday trial", "explanation": "Use the trial's majority support to draft a six-week proposal with step-free access, morning deliveries and improved buses. Invite the 20 opponents to identify concerns before a decision.", "evidenceStatementIds": ["traffic-s0", "traffic-s1", "traffic-s4", "traffic-s5"]},
            {"title": "Agree how to assess the results", "explanation": "Propose measures for shop revenue and access, then review the trial before deciding on permanence. This is a suggested next step, not an agreed evaluation plan.", "evidenceStatementIds": ["traffic-s2", "traffic-s6"]},
            {"title": "Ask the rest of the group about evening events", "explanation": "Seek answers from the 51 people who did not respond before treating monthly evening events as a shared priority.", "evidenceStatementIds": ["traffic-s8"]},
        ],
        "limitations": [
            {"title": "Only nine people answered about evening events", "explanation": "All nine respondents support events, but coverage is only 15% of the 60 voters. The 51 missing responses are neither neutral votes nor evidence of support.", "evidenceStatementIds": ["traffic-s8"]},
        ],
    }


def traffic_themes(evidence):
    profiles = [
        ([(1, 'support'), (2, 'support'), (3, 'support')], 'Extend the pedestrian zone',
         'They support a Saturday trial, immediate permanence and weekday restrictions. Their support extends beyond a temporary weekend change.'),
        ([(1, 'support'), (3, 'oppose'), (7, 'oppose')], 'A Saturday trial with limits',
         'They support a Saturday trial but oppose weekday restrictions and an entry charge. Testing a weekend change does not mean backing every restriction.'),
        ([(1, 'oppose'), (3, 'oppose'), (5, 'support')], 'Better buses without road restrictions',
         'They support better bus frequency but oppose both the Saturday trial and weekday restrictions. Better transport is common ground; the proposed road closures are not.'),
    ]
    groups = []
    for group in evidence['groups']:
        statements = {s['id']: s for s in group['statements']}
        for required, title, description in profiles:
            if all((s := statements.get(f'traffic-s{i}')) and s[direction] > s['responded'] / 2
                   for i, direction in required):
                groups.append({'groupId': group['groupId'], 'title': title, 'description': description,
                               'evidenceStatementIds': [f'traffic-s{i}' for i, _ in required]})
                break
    return {'groups': groups, 'shared': None}
