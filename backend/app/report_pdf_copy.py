"""Localize known methodology definitions without rewriting saved editorial prose."""

METHODS = {
    'en': {
        'supportDefinition': 'Agree and strongly agree responses are counted as support.',
        'coverageDefinition': 'Coverage is the share of voting participants who responded to a statement.',
        'neutralDefinition': 'Neutral is an observed neutral response. Missing responses remain missing and are never counted as neutral.',
        'overlapDefinition': 'Overlap includes only people who answered both statements. Support means agree or strongly agree; neutral and disagreement count as not supporting that statement in this comparison.',
        'commonGroundRule': 'Statements need at least 60% support and the minimum evidence threshold for this session.',
        'openQuestionRule': 'Open questions have directional support between 35% and 65% and meet the minimum evidence threshold.',
        'privacy': 'Voting results exclude participant identifiers and individual ballots. Published transcripts retain the recorded words and recorder labels.',
        'minimumEvidence': 'Minimum evidence threshold: {count} responses per statement.',
    },
    'zh': {
        'supportDefinition': '同意與非常同意的回應均計為支持。',
        'coverageDefinition': '覆蓋率是所有投票者中對某項主張作出回應的比例。',
        'neutralDefinition': '中立是實際記錄的中立回應。未回答維持為未回答，不會計為中立。',
        'overlapDefinition': '重疊分析只納入同時回答兩項主張的人。同意與非常同意計為支持；此比較中，中立與反對均計為不支持該主張。',
        'commonGroundRule': '共同立場須獲得至少 60% 的支持，並達到本次討論的最低證據門檻。',
        'openQuestionRule': '待釐清問題的方向性支持率介於 35% 與 65% 之間，並須達到最低證據門檻。',
        'privacy': '投票結果不包含參與者識別資訊或個別選票。已發佈的逐字稿保留錄音文字與錄音來源標籤。',
        'minimumEvidence': '最低證據門檻：每項主張 {count} 筆回應。',
    },
    'de': {
        'supportDefinition': 'Zustimmung und starke Zustimmung werden als Unterstützung gezählt.',
        'coverageDefinition': 'Die Abdeckung ist der Anteil aller Abstimmenden, die auf eine Aussage geantwortet haben.',
        'neutralDefinition': 'Neutral bezeichnet eine tatsächlich neutrale Antwort. Fehlende Antworten bleiben fehlend und zählen nie als neutral.',
        'overlapDefinition': 'Überschneidungen umfassen nur Personen, die beide Aussagen beantwortet haben. Zustimmung und starke Zustimmung zählen als Unterstützung; neutrale und ablehnende Antworten zählen in diesem Vergleich nicht als Unterstützung.',
        'commonGroundRule': 'Aussagen benötigen mindestens 60% Unterstützung und die Mindestschwelle für Evidenz dieser Sitzung.',
        'openQuestionRule': 'Offene Fragen liegen bei einer gerichteten Unterstützung zwischen 35% und 65% und erfüllen die Mindestschwelle für Evidenz.',
        'privacy': 'Abstimmungsergebnisse enthalten keine Teilnehmerkennungen oder individuellen Stimmzettel. Veröffentlichte Transkripte behalten die aufgezeichneten Worte und Quellenbezeichnungen.',
        'minimumEvidence': 'Mindestschwelle für Evidenz: {count} Antworten pro Aussage.',
    },
    'fr': {
        'supportDefinition': 'Les réponses d’accord et tout à fait d’accord sont comptées comme un soutien.',
        'coverageDefinition': 'La couverture est la part des personnes ayant voté qui ont répondu à un énoncé.',
        'neutralDefinition': 'Neutre désigne une réponse neutre enregistrée. Les réponses manquantes restent manquantes et ne sont jamais comptées comme neutres.',
        'overlapDefinition': 'Le chevauchement ne concerne que les personnes ayant répondu aux deux énoncés. L’accord et l’accord total comptent comme soutien ; les réponses neutres et les désaccords ne comptent pas comme soutien dans cette comparaison.',
        'commonGroundRule': 'Les énoncés doivent recueillir au moins 60% de soutien et atteindre le seuil minimal de données de cette session.',
        'openQuestionRule': 'Les questions ouvertes ont un soutien directionnel entre 35% et 65% et atteignent le seuil minimal de données.',
        'privacy': 'Les résultats des votes excluent les identifiants des participants et les bulletins individuels. Les transcriptions publiées conservent les mots enregistrés et les noms des sources audio.',
        'minimumEvidence': 'Seuil minimal de données : {count} réponses par énoncé.',
    },
    'it': {
        'supportDefinition': 'Le risposte d’accordo e molto d’accordo sono conteggiate come sostegno.',
        'coverageDefinition': 'La copertura è la quota delle persone votanti che hanno risposto a un’affermazione.',
        'neutralDefinition': 'Neutrale indica una risposta neutrale registrata. Le risposte mancanti restano mancanti e non vengono mai contate come neutrali.',
        'overlapDefinition': 'La sovrapposizione include solo chi ha risposto a entrambe le affermazioni. Accordo e forte accordo contano come sostegno; risposte neutrali e disaccordo non contano come sostegno in questo confronto.',
        'commonGroundRule': 'Le affermazioni richiedono almeno il 60% di sostegno e la soglia minima di evidenza di questa sessione.',
        'openQuestionRule': 'Le domande aperte hanno un sostegno direzionale tra il 35% e il 65% e raggiungono la soglia minima di evidenza.',
        'privacy': 'I risultati del voto escludono gli identificativi dei partecipanti e le schede individuali. Le trascrizioni pubblicate conservano le parole registrate e le etichette delle fonti audio.',
        'minimumEvidence': 'Soglia minima di evidenza: {count} risposte per affermazione.',
    },
}

COMPARISONS = {
    'en': ('Where groups differ', 'These are descriptive contrasts, not statistical significance tests. Each row has at least five answers and covers at least half of its group.', 'Support', 'Oppose', 'Overlapping dots are spread slightly for readability.'),
    'zh': ('群組之間的差異', '這些是描述性比較，不是統計顯著性檢定。每列至少包含五筆回應，且涵蓋至少一半的群組成員。', '支持', '反對', '重疊的圓點略為分開，以便閱讀。'),
    'de': ('Unterschiede zwischen Gruppen', 'Dies sind beschreibende Vergleiche, keine statistischen Signifikanztests. Jede Zeile umfasst mindestens fünf Antworten und mindestens die Hälfte der Gruppe.', 'Unterstützung', 'Ablehnung', 'Überlappende Punkte sind zur besseren Lesbarkeit leicht versetzt.'),
    'fr': ('Différences entre les groupes', 'Ces comparaisons sont descriptives, sans test de signification statistique. Chaque ligne comprend au moins cinq réponses et couvre au moins la moitié du groupe.', 'Soutien', 'Opposition', 'Les points superposés sont légèrement espacés pour faciliter la lecture.'),
    'it': ('Differenze tra i gruppi', 'Questi confronti sono descrittivi, non test di significatività statistica. Ogni riga comprende almeno cinque risposte e almeno metà del gruppo.', 'Sostegno', 'Opposizione', 'I punti sovrapposti sono leggermente distanziati per facilitarne la lettura.'),
}


def methodology_copy(report, language, concise=False):
    copy = METHODS.get(language, METHODS['en'])
    for key, value in (report.get('methodology') or {}).items():
        if not isinstance(value, str):
            continue
        if value == METHODS['en'].get(key) or (key == 'privacy' and value ==
                'The public snapshot contains aggregate counts only and no participant identifiers or individual ballots.'):
            if not concise or key == 'privacy':
                yield copy[key]
        else:
            # Preserve changed rules or unrecognized definitions from older snapshots.
            yield value
    minimum = (report.get('evidence') or {}).get('minimumEvidenceResponses')
    if minimum is not None:
        yield copy['minimumEvidence'].format(count=minimum)
