"""A paginated, searchable export of a saved report. No AI or external fetches."""
from __future__ import annotations

from html import escape
from io import BytesIO
import math
from pathlib import Path
import re
from threading import Lock
from urllib.parse import quote, urlsplit

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, CondPageBreak, Flowable, Frame, HRFlowable, KeepTogether, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

from .report_pdf_copy import COMPARISONS, methodology_copy
from .report_reading import reading_copy, transcript_paragraphs

COPY = {
    'en': {
        'report': 'Discussion report', 'contents': 'In this report', 'voters': 'people voted', 'statements': 'statements', 'responses': 'responses', 'coverage': 'response coverage',
        'common': 'Common ground', 'patterns': 'Voting patterns', 'findings': 'Key findings', 'questions': 'Open questions', 'next': 'Next steps', 'all': 'All statements', 'methods': 'Methodology and participation', 'transcript': 'Discussion transcript',
        'draft': 'Draft - not yet approved', 'approved': 'Approved as final', 'stale': 'Voting has reopened. This document preserves the earlier published snapshot.',
        'online': 'Online report', 'original': 'Original session', 'version': 'Version', 'generated': 'Report created', 'page': 'Page', 'group': 'Group', 'evidence': 'Statement references', 'answered': 'answered', 'missing': 'unanswered',
        'directions': 'Directions in the package', 'conditions': 'Conditions and safeguards', 'unresolved': 'Still unresolved', 'tradeoffs': 'Trade-offs considered', 'concerns': 'Remaining concerns', 'shared': 'Shared points', 'divides': 'Open questions', 'bridge': 'A possible way forward', 'insights': 'How views connect',
        'agreement': 'Agreement', 'participation': 'Participation', 'scope': 'These results describe the people who voted in this session; they are not an estimate of the wider population. Missing answers are neither neutral nor opposed.',
        'mapNote': 'Each dot represents one voter. Groups describe similar recorded responses, not identities or fixed positions. The map is exploratory.',
        'unavailable': 'No opinion map was saved with this report.', 'provisional': 'Early groups - patterns may change as more evidence becomes available.',
        'legend': ['Strongly agree', 'Agree', 'Neutral', 'Disagree', 'Strongly disagree'],
        'transcriptNote': 'The complete transcript saved with this report. Automatic transcription may contain errors. Recorder labels may cover several speakers. All times are UTC.',
        'entries': 'transcript entries', 'recorder': 'Recorder', 'timeUnknown': 'Time unavailable', 'audioMissing': 'Audio segment could not be transcribed.', 'legacy': 'No transcript was included in this saved report.', 'empty': 'No transcript was recorded for this session.', 'limitations': 'Interpretation and limitations',
    },
    'zh': {
        'report': '討論報告', 'contents': '報告目錄', 'voters': '位投票者', 'statements': '項主張', 'responses': '筆回應', 'coverage': '回應覆蓋率',
        'common': '共同立場', 'patterns': '投票模式', 'findings': '主要發現', 'questions': '待釐清問題', 'next': '後續步驟', 'all': '全部主張', 'methods': '方法與參與情況', 'transcript': '討論逐字稿',
        'draft': '草案 - 尚未通過', 'approved': '已通過為最終版本', 'stale': '投票已重新開放。本文件保留先前發佈的報告快照。',
        'online': '線上報告', 'original': '原始討論', 'version': '版本', 'generated': '報告建立時間', 'page': '頁', 'group': '群組', 'evidence': '參考主張', 'answered': '已回答', 'missing': '未回答',
        'directions': '方案方向', 'conditions': '條件與保障', 'unresolved': '尚待解決', 'tradeoffs': '考量的取捨', 'concerns': '仍有疑慮', 'shared': '共同點', 'divides': '待釐清問題', 'bridge': '可能的前進方向', 'insights': '觀點之間的連結',
        'agreement': '同意比例', 'participation': '參與比例', 'scope': '結果僅描述本次討論的投票者，不代表整體人口。未回答不能視為中立或反對。',
        'mapNote': '每個點代表一位投票者。群組表示相似的投票回應，不代表身分或固定立場。此圖僅供探索。', 'unavailable': '此報告未儲存觀點分布圖。', 'provisional': '初步群組 - 隨著證據增加，模式可能改變。',
        'legend': ['非常同意', '同意', '中立', '不同意', '非常不同意'],
        'transcriptNote': '本報告保存的完整逐字稿。自動轉錄可能有誤；錄音來源標籤可能包含多位講者。時間均為 UTC。',
        'entries': '段逐字稿', 'recorder': '錄音來源', 'timeUnknown': '時間不詳', 'audioMissing': '此段音訊無法轉錄。', 'legacy': '此已儲存的報告未包含逐字稿。', 'empty': '這場討論沒有記錄逐字稿。', 'limitations': '解讀與限制',
    },
    'de': {
        'report': 'Diskussionsbericht', 'contents': 'In diesem Bericht', 'voters': 'Abstimmende', 'statements': 'Aussagen', 'responses': 'Antworten', 'coverage': 'Antwortabdeckung', 'common': 'Gemeinsame Grundlage', 'patterns': 'Abstimmungsmuster', 'findings': 'Wichtigste Ergebnisse', 'questions': 'Offene Fragen', 'next': 'Nächste Schritte', 'all': 'Alle Aussagen', 'methods': 'Methodik und Beteiligung', 'transcript': 'Gesprächstranskript', 'draft': 'Entwurf - noch nicht bestätigt', 'approved': 'Als endgültig bestätigt', 'stale': 'Die Abstimmung wurde wieder geöffnet. Dieses Dokument bewahrt den früher veröffentlichten Stand.', 'online': 'Onlinebericht', 'original': 'Ursprüngliche Sitzung', 'version': 'Version', 'generated': 'Bericht erstellt', 'page': 'Seite', 'group': 'Gruppe', 'evidence': 'Aussagenverweise', 'answered': 'beantwortet', 'missing': 'unbeantwortet', 'directions': 'Vorgeschlagene Richtungen', 'conditions': 'Bedingungen und Sicherungen', 'unresolved': 'Weiterhin offen', 'tradeoffs': 'Abgewogene Zielkonflikte', 'concerns': 'Verbleibende Bedenken', 'shared': 'Gemeinsame Punkte', 'divides': 'Offene Fragen', 'bridge': 'Ein möglicher Weg', 'insights': 'Verbindungen zwischen Ansichten', 'agreement': 'Zustimmung', 'participation': 'Beteiligung', 'scope': 'Diese Ergebnisse beschreiben die Abstimmenden dieser Sitzung, nicht die Gesamtbevölkerung. Fehlende Antworten sind weder neutral noch ablehnend.', 'mapNote': 'Jeder Punkt steht für eine abstimmende Person. Gruppen beschreiben ähnliche Antworten, keine Identitäten oder festen Positionen. Die Karte ist explorativ.', 'unavailable': 'Für diesen Bericht wurde keine Meinungskarte gespeichert.', 'provisional': 'Vorläufige Gruppen - Muster können sich mit weiteren Antworten ändern.', 'legend': ['Stimme stark zu', 'Stimme zu', 'Neutral', 'Stimme nicht zu', 'Lehne stark ab'], 'transcriptNote': 'Das vollständige gespeicherte Transkript. Automatische Transkription kann Fehler enthalten; eine Aufnahmequelle kann mehrere Personen umfassen. Alle Zeiten sind UTC.', 'entries': 'Transkriptabschnitte', 'recorder': 'Aufnahmequelle', 'timeUnknown': 'Zeit unbekannt', 'audioMissing': 'Dieser Audioabschnitt konnte nicht transkribiert werden.', 'legacy': 'Dieser gespeicherte Bericht enthält kein Transkript.', 'empty': 'Für diese Sitzung wurde kein Transkript aufgezeichnet.', 'limitations': 'Einordnung und Grenzen',
    },
    'fr': {
        'report': 'Rapport de discussion', 'contents': 'Dans ce rapport', 'voters': 'personnes ont voté', 'statements': 'énoncés', 'responses': 'réponses', 'coverage': 'couverture des réponses', 'common': 'Terrain commun', 'patterns': 'Tendances des votes', 'findings': 'Principaux constats', 'questions': 'Questions ouvertes', 'next': 'Prochaines étapes', 'all': 'Tous les énoncés', 'methods': 'Méthode et participation', 'transcript': 'Transcription de la discussion', 'draft': 'Brouillon - pas encore approuvé', 'approved': 'Approuvé comme version finale', 'stale': 'Le vote a été rouvert. Ce document conserve la version publiée précédemment.', 'online': 'Rapport en ligne', 'original': 'Session d’origine', 'version': 'Version', 'generated': 'Rapport créé', 'page': 'Page', 'group': 'Groupe', 'evidence': 'Références aux énoncés', 'answered': 'réponses', 'missing': 'sans réponse', 'directions': 'Orientations proposées', 'conditions': 'Conditions et garanties', 'unresolved': 'Points non résolus', 'tradeoffs': 'Compromis envisagés', 'concerns': 'Préoccupations restantes', 'shared': 'Points communs', 'divides': 'Questions ouvertes', 'bridge': 'Une voie possible', 'insights': 'Liens entre les points de vue', 'agreement': 'Accord', 'participation': 'Participation', 'scope': 'Ces résultats décrivent les personnes ayant voté dans cette session, et non la population générale. Une absence de réponse ne signifie ni neutralité ni opposition.', 'mapNote': 'Chaque point représente une personne ayant voté. Les groupes décrivent des réponses similaires, pas des identités ou positions fixes. La carte est exploratoire.', 'unavailable': 'Aucune carte des opinions n’a été enregistrée.', 'provisional': 'Groupes provisoires - les tendances peuvent évoluer avec de nouvelles réponses.', 'legend': ['Tout à fait d’accord', 'D’accord', 'Neutre', 'Pas d’accord', 'Pas du tout d’accord'], 'transcriptNote': 'La transcription complète enregistrée avec ce rapport. Elle peut contenir des erreurs ; une source audio peut couvrir plusieurs personnes. Toutes les heures sont en UTC.', 'entries': 'passages transcrits', 'recorder': 'Source audio', 'timeUnknown': 'Heure inconnue', 'audioMissing': 'Ce passage audio n’a pas pu être transcrit.', 'legacy': 'Ce rapport ne contient pas de transcription enregistrée.', 'empty': 'Aucune transcription n’a été enregistrée pour cette session.', 'limitations': 'Interprétation et limites',
    },
    'it': {
        'report': 'Rapporto della discussione', 'contents': 'In questo rapporto', 'voters': 'persone hanno votato', 'statements': 'affermazioni', 'responses': 'risposte', 'coverage': 'copertura delle risposte', 'common': 'Terreno comune', 'patterns': 'Schemi di voto', 'findings': 'Risultati principali', 'questions': 'Domande aperte', 'next': 'Prossimi passi', 'all': 'Tutte le affermazioni', 'methods': 'Metodo e partecipazione', 'transcript': 'Trascrizione della discussione', 'draft': 'Bozza - non ancora approvata', 'approved': 'Approvato come definitivo', 'stale': 'Il voto è stato riaperto. Questo documento conserva la versione pubblicata in precedenza.', 'online': 'Rapporto online', 'original': 'Sessione originale', 'version': 'Versione', 'generated': 'Rapporto creato', 'page': 'Pagina', 'group': 'Gruppo', 'evidence': 'Riferimenti alle affermazioni', 'answered': 'risposte', 'missing': 'senza risposta', 'directions': 'Direzioni proposte', 'conditions': 'Condizioni e garanzie', 'unresolved': 'Questioni irrisolte', 'tradeoffs': 'Compromessi considerati', 'concerns': 'Preoccupazioni rimanenti', 'shared': 'Punti comuni', 'divides': 'Domande aperte', 'bridge': 'Una possibile strada', 'insights': 'Collegamenti tra le opinioni', 'agreement': 'Accordo', 'participation': 'Partecipazione', 'scope': 'Questi risultati descrivono chi ha votato in questa sessione, non la popolazione generale. Le risposte mancanti non indicano neutralità o opposizione.', 'mapNote': 'Ogni punto rappresenta una persona che ha votato. I gruppi descrivono risposte simili, non identità o posizioni fisse. La mappa è esplorativa.', 'unavailable': 'Nessuna mappa delle opinioni è stata salvata.', 'provisional': 'Gruppi provvisori - gli schemi possono cambiare con nuove risposte.', 'legend': ['Molto d’accordo', 'D’accordo', 'Neutrale', 'In disaccordo', 'Molto in disaccordo'], 'transcriptNote': 'La trascrizione completa salvata con il rapporto. La trascrizione automatica può contenere errori; una fonte audio può comprendere più persone. Tutti gli orari sono UTC.', 'entries': 'segmenti trascritti', 'recorder': 'Fonte audio', 'timeUnknown': 'Ora non disponibile', 'audioMissing': 'Questo segmento audio non è stato trascritto.', 'legacy': 'Questo rapporto non include una trascrizione salvata.', 'empty': 'Non è stata registrata una trascrizione per questa sessione.', 'limitations': 'Interpretazione e limiti',
    },
}

INK = colors.HexColor('#192b29')
MUTED = colors.HexColor('#586b66')
ACCENT = colors.HexColor('#386758')
PALE = colors.HexColor('#edf3ee')
RULE = colors.HexColor('#d5dfd8')
VOTE_COLORS = [colors.HexColor(value) for value in ('#4b6853', '#81977f', '#bab2a2', '#b98371', '#8b5149')]
GROUP_COLORS = [colors.HexColor(value) for value in ('#42786d', '#b77b4b', '#7575a3', '#ae6776', '#687b95', '#899445')]
PAGE_W, PAGE_H = A4
MARGIN = 48
WIDTH = PAGE_W - 2 * MARGIN
_font_lock = Lock()
_render_lock = Lock()


def _fonts():
    with _font_lock:
        if 'MurmiPDF' not in pdfmetrics.getRegisteredFontNames():
            folder = Path(__file__).with_name('pdf_fonts')
            for name, weight in [('MurmiPDF', 'Regular'), ('MurmiPDF-Bold', 'Bold')]:
                pdfmetrics.registerFont(TTFont(name, str(folder / f'NotoSansTC-{weight}.ttf')))
            pdfmetrics.registerFontFamily('MurmiPDF', normal='MurmiPDF', bold='MurmiPDF-Bold', italic='MurmiPDF', boldItalic='MurmiPDF-Bold')


def _text(value):
    # Source material is text, never ReportLab markup, images or executable links.
    return escape(str(value if value is not None else '')).replace('\r\n', '\n').replace('\n', '<br/>')


def _short(text, width, size=8):
    value = str(text or '').replace('\n', ' ')
    while value and pdfmetrics.stringWidth(value, 'MurmiPDF', size) > width:
        value = value[:-1]
    return value


def report_pdf_filename(report):
    session_id = re.sub(r'[^A-Za-z0-9_-]', '_', str(report.get('meta', {}).get('sessionId') or 'session'))[:48]
    version = int(report.get('version') or 1)
    return f'murmi-{session_id}-report-v{version}.pdf'


def select_group_differences(groups):
    """Match the published page's two contrasts and minimum-response guardrails."""
    if len(groups) < 2:
        return []
    indexes = [{row['id']: row for row in group.get('statements', [])} for group in groups]
    differences = []
    for statement in indexes[0].values():
        rows = [(group, index.get(statement['id'])) for group, index in zip(groups, indexes)]
        for group, row in rows:
            size = group.get('size')
            values = [size] + [row.get(key) for key in ('responded','agree','neutral','disagree')] if row else []
            if len(values) != 5 or any(not isinstance(n,(int,float)) or not math.isfinite(n) or n < 0 for n in values):
                break
            if size <= 0 or row['responded'] < max(5,size/2) or row['responded'] > size:
                break
            if row['agree'] + row['neutral'] + row['disagree'] != row['responded']:
                break
        else:
            rates = [row['agree']/row['responded'] for _, row in rows]
            gap = max(rates)-min(rates)
            if gap >= .2:
                differences.append((gap,statement,rows))
    return sorted(differences,key=lambda item:(-item[0],item[1]['id']))[:2]


class VoteBar(Flowable):
    def __init__(self, counts):
        super().__init__()
        self.counts = counts
        self.height = 13

    def wrap(self, available_width, available_height):
        self.width = available_width
        return self.width, self.height

    def draw(self):
        self.canv.setFillColor(PALE)
        self.canv.rect(0, 3, self.width, 7, fill=1, stroke=0)
        total = sum(self.counts)
        x = 0
        for count, color in zip(self.counts, VOTE_COLORS):
            width = self.width * count / total if total else 0
            self.canv.setFillColor(color)
            self.canv.rect(x, 3, width, 7, fill=1, stroke=0)
            x += width


class OpinionMap(Flowable):
    def __init__(self, landscape):
        super().__init__()
        self.groups = landscape.get('groups') or []
        self.width, self.height = WIDTH, 222

    def draw(self):
        c = self.canv
        c.setFillColor(PALE)
        c.roundRect(0, 0, self.width, self.height, 6, fill=1, stroke=0)
        c.setStrokeColor(RULE)
        c.setLineWidth(0.4)
        for fraction in (0.25, 0.5, 0.75):
            c.line(16, self.height*fraction, self.width-16, self.height*fraction)
            c.line(self.width*fraction, 16, self.width*fraction, self.height-16)
        placed = []
        for index, group in enumerate(self.groups):
            color = GROUP_COLORS[index % len(GROUP_COLORS)]
            c.setFillColor(color)
            for dot in group.get('dots') or []:
                x, y = float(dot.get('x', .5)), float(dot.get('y', .5))
                anchor_x = 18 + max(0, min(1, x))*(self.width-36)
                anchor_y = 18 + (1-max(0, min(1, y)))*(self.height-36)
                # Spread coincident responses slightly so every voter remains visible.
                for step in range(500):
                    radius, angle = 3.3*math.sqrt(step), step*2.3999632297
                    px = max(7, min(self.width-7, anchor_x+radius*math.cos(angle)))
                    py = max(7, min(self.height-7, anchor_y+radius*math.sin(angle)))
                    if all(math.hypot(px-ox, py-oy) >= 6.2 for ox, oy in placed):
                        break
                placed.append((px, py))
                c.circle(px, py, 2.5, fill=1, stroke=0)
        badges = []
        for index, group in enumerate(self.groups):
            color = GROUP_COLORS[index % len(GROUP_COLORS)]
            position = group.get('position') or {}
            x = 18 + max(0, min(1, float(position.get('x', .5))))*(self.width-36)
            y = 18 + (1-max(0, min(1, float(position.get('y', .5)))))*(self.height-36)
            anchor_x, anchor_y = x, y
            for step in range(600):
                radius, angle = 3.3*math.sqrt(step), step*2.3999632297
                x = max(12, min(self.width-12, anchor_x+radius*math.cos(angle)))
                y = max(12, min(self.height-12, anchor_y+radius*math.sin(angle)))
                if (all(math.hypot(x-px, y-py) >= 14 for px, py in placed)
                        and all(math.hypot(x-bx, y-by) >= 24 for bx, by in badges)):
                    break
            badges.append((x, y))
            c.setStrokeColor(color)
            c.line(anchor_x, anchor_y, x, y)
            c.setFillColor(colors.white)
            c.setStrokeColor(color)
            c.circle(x, y, 10, fill=1, stroke=1)
            c.setFillColor(color)
            c.setFont('MurmiPDF-Bold', 9)
            c.drawCentredString(x, y-3.2, str(group.get('letter') or chr(65+index)))


class ReportDocument(BaseDocTemplate):
    def __init__(self, stream, report, copy):
        self.report, self.copy = report, copy
        super().__init__(stream, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                         topMargin=52, bottomMargin=46, title=str(report.get('meta', {}).get('topic') or copy['report']),
                         author='Murmi', pageCompression=1)
        self.addPageTemplates(PageTemplate(id='report', frames=[Frame(MARGIN, 46, WIDTH, PAGE_H-98,
                             leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=self.decorate))

    def decorate(self, canvas, document):
        canvas.saveState()
        if document.page > 1:
            canvas.setFont('MurmiPDF-Bold', 8)
            canvas.setFillColor(ACCENT)
            canvas.drawString(MARGIN, PAGE_H-29, 'MURMI')
            canvas.setFont('MurmiPDF', 8)
            canvas.setFillColor(MUTED)
            topic = _short(self.report.get('meta', {}).get('topic'), WIDTH-65)
            canvas.drawRightString(PAGE_W-MARGIN, PAGE_H-29, topic)
            canvas.setStrokeColor(RULE)
            canvas.line(MARGIN, PAGE_H-37, PAGE_W-MARGIN, PAGE_H-37)
        canvas.setStrokeColor(RULE)
        canvas.line(MARGIN, 34, PAGE_W-MARGIN, 34)
        canvas.setFillColor(MUTED)
        canvas.setFont('MurmiPDF', 7.5)
        canvas.drawString(MARGIN, 21, self.copy['report'])
        canvas.drawRightString(PAGE_W-MARGIN, 21, f"{self.copy['page']} {document.page}")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if getattr(flowable, 'pdf_key', None):
            self.canv.bookmarkPage(flowable.pdf_key)
            self.canv.addOutlineEntry(flowable.getPlainText(), flowable.pdf_key, level=0)


def render_report_pdf(report: dict, public_url: str | None = None) -> bytes:
    """Export only the supplied saved snapshot; never consult live session data."""
    # ReportLab's registered TTFont objects cannot subset concurrent documents.
    # The HTTP route runs this work off the event loop with bounded concurrency.
    with _render_lock:
        return _render_report_pdf(report, public_url)


def _render_report_pdf(report, public_url):
    _fonts()
    language = str(report.get('sourceLanguage') or 'en').lower().split('-')[0]
    copy = COPY.get(language, COPY['en'])
    comparison_title, comparison_note, support_label, oppose_label, spread_note = COMPARISONS.get(language, COMPARISONS['en'])
    meta = report.get('meta') or {}
    narrative = (report.get('narrative') or {}).get(report.get('sourceLanguage') or 'en') or {}
    statements = (report.get('evidence') or {}).get('statements') or []
    references = {item['id']: index+1 for index, item in enumerate(statements)}
    styles = {
        'body': ParagraphStyle('body', fontName='MurmiPDF', fontSize=9.5, leading=15, textColor=INK, spaceAfter=8, wordWrap='CJK' if language=='zh' else None, splitLongWords=True, allowWidows=0, allowOrphans=0),
        'small': ParagraphStyle('small', fontName='MurmiPDF', fontSize=7.7, leading=11.5, textColor=MUTED, spaceAfter=7, splitLongWords=True),
        'h1': ParagraphStyle('h1', fontName='MurmiPDF-Bold', fontSize=27, leading=34, textColor=INK, spaceAfter=16),
        'h2': ParagraphStyle('h2', fontName='MurmiPDF-Bold', fontSize=19, leading=25, textColor=INK, spaceAfter=14, keepWithNext=True),
        'h3': ParagraphStyle('h3', fontName='MurmiPDF-Bold', fontSize=11, leading=16, textColor=INK, spaceBefore=10, spaceAfter=7, keepWithNext=True),
        'lead': ParagraphStyle('lead', fontName='MurmiPDF', fontSize=12, leading=19, textColor=INK, spaceAfter=14),
        'kicker': ParagraphStyle('kicker', fontName='MurmiPDF-Bold', fontSize=8, leading=12, textColor=ACCENT, spaceAfter=8, keepWithNext=True),
        'statement': ParagraphStyle('statement', fontName='MurmiPDF-Bold', fontSize=9.5, leading=14, textColor=INK, spaceAfter=5),
    }
    if language == 'zh':
        for style in styles.values():
            style.wordWrap = 'CJK'
    story = []
    def p(value, style='body', markup=False):
        return Paragraph(str(value) if markup else _text(value), styles[style])
    def add(value, style='body'):
        if value:
            story.append(p(value, style))
    section_count = 0
    def section(label, new_page=False, minimum_space=170):
        nonlocal section_count
        section_count += 1
        if new_page:
            story.append(PageBreak())
        else:
            story.extend([CondPageBreak(minimum_space), Spacer(1,22)])
        heading = p(f'{section_count:02d}  {label}', 'h2')
        heading.pdf_key = f'section-{section_count}'
        story.extend([heading, HRFlowable(width='100%', thickness=1, color=ACCENT, spaceAfter=14)])
    def refs(item):
        indices = list(dict.fromkeys(references[sid] for sid in item.get('evidenceStatementIds', []) if sid in references))
        if indices:
            if story and isinstance(story[-1], Paragraph):
                story[-1].keepWithNext = True
            links = ', '.join(f'<link href="#statement-{number}" color="#386758">{number}</link>' for number in indices)
            story.append(p(f"{_text(copy['evidence'])}: {links}", 'small', markup=True))
    def bullet_list(title, items):
        values = [item if isinstance(item, str) else item.get('text', '') for item in (items or [])]
        values = [value for value in values if value]
        if not values:
            return
        add(title, 'h3')
        for value in values:
            story.append(p('•  ' + value))
    add('MURMI  /  ' + copy['report'].upper(), 'kicker')
    story.append(Spacer(1,18))
    add(meta.get('topic') or copy['report'], 'h1')
    add(narrative.get('headline'), 'lead')
    add(narrative.get('standfirst'))
    story.append(Spacer(1,10))
    if report.get('status') == 'stale':
        add(copy['stale'])
    elif report.get('status') != 'published':
        add(copy['draft'], 'kicker')
    origin = 'https://murmi.org'
    source_links = []
    if public_url and urlsplit(public_url).scheme in ('http','https') and urlsplit(public_url).netloc:
        parsed = urlsplit(public_url)
        origin = f'{parsed.scheme}://{parsed.netloc}'
        source_links.append(f'<link href="{escape(public_url, quote=True)}" color="#386758">{_text(copy["online"])}</link>')
    original = f"{origin}/?code={quote(str(meta.get('sessionId') or ''), safe='')}"
    source_links.append(f'<link href="{escape(original, quote=True)}" color="#386758">{_text(copy["original"])}</link>')
    story.append(p('  ·  '.join(source_links), 'small', markup=True))

    proposal = report.get('commonGroundProposal') or {}
    if proposal.get('groupStatement'):
        section(copy['common'])
        endorsed = proposal.get('status') == 'endorsed' and bool(proposal.get('endorsement'))
        add(copy['approved'] if endorsed else copy['draft'], 'kicker')
        add(proposal['groupStatement'], 'lead')
        validation = (proposal.get('endorsement') if endorsed else proposal.get('votes')) or {}
        agree, disagree = int(validation.get('agree') or 0), int(validation.get('disagree') or 0)
        total = int(validation.get('respondentCount', validation.get('total', agree+disagree)) or 0)
        roster = int(validation.get('rosterSize') or meta.get('participantCount') or 0)
        if total:
            add(f"{copy['agreement']}: {agree}/{total} ({agree/total:.0%})  ·  {copy['participation']}: {total}/{roster}" if roster else f"{copy['agreement']}: {agree}/{total} ({agree/total:.0%})", 'small')
        for key, title in [('commonGround','shared'), ('divides','divides'), ('insights','insights'), ('recommendations','directions'), ('essentialConditions','conditions'), ('unresolvedQuestions','unresolved'), ('tradeoffs','tradeoffs')]:
            bullet_list(copy[title], proposal.get(key))
        bullet_list(copy['bridge'], [proposal['bridgingProposal']] if proposal.get('bridgingProposal') else [])
        bullet_list(copy['concerns'], [item.get('reason','') for item in (proposal.get('endorsement') or {}).get('remainingConcerns',[])])

    landscape = report.get('opinionLandscape') or {}
    section(copy['patterns'], minimum_space=400 if landscape.get('available') else 170)
    add(copy['mapNote'])
    if landscape.get('status') == 'provisional':
        add(copy['provisional'], 'small')
    groups = landscape.get('groups') or []
    if landscape.get('available') and groups:
        story.extend([OpinionMap(landscape), Spacer(1,10)])
        add(spread_note, 'small')
        themes = {item['groupId']:item for item in (landscape.get('themes') or {}).get('groups',[])}
        for index, group in enumerate(groups):
            theme = themes.get(group.get('id')) or group.get('theme') or {}
            add(f"{copy['group']} {group.get('letter') or chr(65+index)}  ·  {group.get('size',0)} {copy['voters']}", 'h3')
            if theme.get('title'):
                add(theme['title'], 'kicker')
            add(theme.get('description'))
            refs(theme)
        shared = (landscape.get('themes') or {}).get('shared') or {}
        if shared.get('description'):
            add(shared.get('title') or copy['shared'], 'h3')
            add(shared['description'])
            refs(shared)
        differences = select_group_differences(groups)
        if differences:
            add(comparison_title, 'h3')
            add(comparison_note, 'small')
        for _, statement, rows in differences:
            add(statement['text'], 'h3')
            cells = [[p(label,'small') for label in (copy['group'],support_label,copy['legend'][2],oppose_label,copy['missing'])]]
            for group, row in rows:
                cells.append([p(value,'small') for value in (
                    group.get('letter') or group['id'],
                    f"{row['agree']}/{row['responded']} ({row['agree']/row['responded']:.0%})",
                    row['neutral'], row['disagree'], group['size']-row['responded'])])
            table = Table(cells,colWidths=[WIDTH*.14,WIDTH*.26,WIDTH*.2,WIDTH*.2,WIDTH*.2],repeatRows=1,hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('VALIGN',(0,0),(-1,-1),'TOP'),
                                      ('LINEBELOW',(0,0),(-1,-1),.4,RULE),('TOPPADDING',(0,0),(-1,-1),8)]))
            story.extend([table,Spacer(1,8)])
    else:
        add(copy['unavailable'])

    for key, label in [('takeaways','findings'), ('openQuestions','questions'), ('implications','next')]:
        if key == 'implications' and proposal.get('groupStatement'):
            continue
        items = [item for item in narrative.get(key,[]) if any(sid in references for sid in item.get('evidenceStatementIds',[]))]
        if not items and key in ('takeaways','openQuestions'):
            ids = (report.get('story') or {}).get('takeawayStatementIds' if key=='takeaways' else 'openQuestionStatementIds',[])
            items = [{'title':item['text'], 'evidenceStatementIds':[item['id']]} for item in statements if item['id'] in ids]
        if items:
            section(copy[label])
            for index, item in enumerate(items,1):
                add(f"{index:02d}  {item.get('title','')}", 'h3')
                add(item.get('explanation'))
                refs(item)

    section(copy['all'], minimum_space=380)
    add(copy['scope'], 'small')
    add('  ·  '.join(copy['legend']), 'small')
    for index, result in enumerate(statements,1):
        heading = p(f'<a name="statement-{index}"/>{index:02d}  {_text(result.get("text"))}', 'statement', markup=True)
        counts = result.get('counts') or {}
        if 'strongly_agree' in counts:
            values = [int(counts.get(key) or 0) for key in ('strongly_agree','agree','neutral','disagree','strongly_disagree')]
        else:
            values = [0, int(result.get('support') or 0), int(result.get('neutral') or 0), int(result.get('oppose') or 0), 0]
        total = sum(values)
        legend = '  ·  '.join(f'{label} {value} ({value/total:.0%})' if total else f'{label} 0' for label,value in zip(copy['legend'], values))
        voter_count = int(meta.get('voterCount') or 0)
        story.append(KeepTogether([heading, VoteBar(values), p(legend, 'small'), p(f"{total}/{voter_count} {copy['answered']}  ·  {max(0,voter_count-total)} {copy['missing']}", 'small')]))
        story.append(HRFlowable(width='100%', thickness=.4, color=RULE, spaceBefore=3, spaceAfter=8))

    reader_copy = reading_copy(language)
    section(copy['transcript'], new_page=True)
    transcript = report.get('transcript')
    if transcript:
        add(reader_copy['transcriptIntro'], 'small')
        story.append(Spacer(1,10))
        for paragraph in transcript_paragraphs(transcript):
            add(copy['audioMissing'] if paragraph['missing'] else paragraph['text'])
    else:
        add(copy['empty'] if isinstance(transcript,list) else copy['legacy'])

    section(reader_copy['title'], new_page=True)
    add(reader_copy['participationTitle'], 'h3')
    add(reader_copy['participation'].format(voters=meta.get('voterCount',0), statements=len(statements), responses=meta.get('responseCount',0)))
    coverage = (report.get('analysis') or {}).get('responseCoverage') or {}
    if coverage.get('averageRate') is not None:
        add(reader_copy['coverage'].format(coverage=f"{float(coverage['averageRate'])*100:.0f}"))
    add(reader_copy['scope'])
    add(reader_copy['votesTitle'], 'h3')
    add(reader_copy['votes'])
    if landscape.get('available'):
        add(reader_copy['groupsTitle'], 'h3')
        add(reader_copy['groups'])
    add(reader_copy['preparedTitle'], 'h3')
    add(reader_copy['prepared'])
    if narrative or (landscape.get('themes') or {}).get('groups') or proposal.get('groupStatement'):
        add(reader_copy['ai'])
    if narrative.get('limitations'):
        add(reader_copy['limitationsTitle'], 'h3')
        for item in narrative['limitations']:
            add(item.get('title'), 'kicker')
            add(item.get('explanation'))
            refs(item)
    story.append(Spacer(1,10))
    for value in methodology_copy(report, language, concise=True):
        add(value, 'small')
    output = BytesIO()
    ReportDocument(output, report, copy).build(story)
    return output.getvalue()
