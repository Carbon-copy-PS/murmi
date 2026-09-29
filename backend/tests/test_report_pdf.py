"""Exercise document contents, typography and the published-only download route."""
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import re
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from pypdf import PdfReader

from backend.app import main
from backend.app.report_pdf import COPY, render_report_pdf, report_pdf_filename, select_group_differences
from backend.app.report_pdf_copy import methodology_copy
from backend.app.report_reading import transcript_paragraphs, reading_copy
from backend.app.reporting import build_report_snapshot
from backend.app.session import Session, SessionManager, Statement


def fixture(language='en'):
    session = Session(id='PDFTEST', public_id='pdf-test', language=language, topic='A readable report - 中文與 français', voting_open=False)
    session.statements = [Statement(id='s1', round=1, approved=True, text='Keep a staffed help desk. 保留實體服務。',
                                    votes={'a':'strongly_agree', 'b':'agree', 'c':'neutral'})]
    session.transcript = [
        {'text':'First entry: <b>literal source</b> & 中文。简体：刚才没讲这个问题。繁體：這個問題。', 'speaker':'Recorder', 'timestamp':1700000000, 'participantId':'private-participant', 'providerToken':'private-provider'},
        {'text':'', 'timestamp':None, 'transcriptionStatus':'missing'},
        {'text':'Last entry: déjà vu, Straße, città.', 'speaker':'Room', 'timestamp':1700000600},
    ]
    snapshot = build_report_snapshot(session,1)
    snapshot['status'] = 'published'
    snapshot['narrative'] = {language:{'headline':'Preserve access to people', 'standfirst':'A saved conclusion, with qualifications.',
                                      'takeaways':[{'title':'Staffed access', 'explanation':'Two of three respondents supported the statement.', 'evidenceStatementIds':['s1']}],
                                      'openQuestions':[], 'implications':[]}}
    snapshot['opinionLandscape'] = {'available':True, 'status':'provisional', 'groups':[
        {'id':0,'letter':'A','size':3,'position':{'x':.5,'y':.5},'dots':[{'x':.2,'y':.3},{'x':.4,'y':.5},{'x':.7,'y':.8}]}],
        'themes':{'groups':[{'groupId':0,'title':'Staffed access','description':'A complete profile based on recorded responses.','evidenceStatementIds':['s1']}]}}
    session.report_snapshot, session.report_version, session.report_status = snapshot, 1, 'published'
    return session, snapshot


def compact(text):
    return re.sub(r'\s+', '', text)


def body_text(reader):
    text = []
    def collect(value, cm, tm, font, size):
        # Decorations use the page coordinate system; body flowables translate
        # it. Strip repeating decorations when comparing across page breaks.
        if cm[4:6] == [0.0,0.0] and (tm[5] < 46 or tm[5] > 795):
            return
        text.append(value)
    for page in reader.pages:
        page.extract_text(visitor_text=collect)
    return ''.join(text)


class ReportPDFTests(unittest.TestCase):
    def test_transcript_reads_continuously_and_reader_guide_is_last(self):
        _, report = fixture()
        report['transcript'] = [{'text':'A sentence split','speaker':'Internal recorder','timestamp':1700000000},
                                {'text':'across recording chunks. The full discussion follows.','timestamp':1700000001}]
        before = deepcopy(report)
        reader = PdfReader(BytesIO(render_report_pdf(report)))
        text = body_text(reader)
        self.assertIn('A sentence split across recording chunks.',text)
        self.assertNotIn('Internal recorder',text)
        self.assertNotIn('transcript entries',text)
        self.assertNotIn('2023-11-14',text)
        self.assertTrue(reader.outline[-1]['/Title'].endswith(reading_copy('en')['title']))
        self.assertEqual(report,before)

    def test_readable_paragraphs_preserve_words_and_audio_gaps(self):
        words='One complete sentence. '*80
        entries=[{'text':words[:81]},{'text':words[81:]},{'transcriptionStatus':'missing'}, {'text':'Last words.'}]
        paragraphs=transcript_paragraphs(entries)
        self.assertGreater(len(paragraphs),3)
        self.assertEqual(compact(''.join(p['text'] for p in paragraphs)),compact(words+'Last words.'))
        self.assertTrue(paragraphs[-2]['missing'])
        self.assertEqual(paragraphs[-1]['text'],'Last words.')

    def test_full_snapshot_is_searchable_and_fonts_and_links_are_embedded(self):
        _, report = fixture()
        before = deepcopy(report)
        result = render_report_pdf(report,'https://murmi.example/r/pdf-test')
        reader = PdfReader(BytesIO(result))
        text = '\n'.join(page.extract_text() for page in reader.pages)
        self.assertTrue(result.startswith(b'%PDF-'))
        first_page = reader.pages[0].extract_text()
        self.assertIn('Voting patterns', first_page)
        for removed in ('In this report', 'Version 1', 'Report created'):
            self.assertNotIn(removed, first_page)
        self.assertNotIn('people voted', first_page.split('01 Voting patterns')[0])
        self.assertIn('Who took part', reader.pages[-1].extract_text())
        for value in [report['meta']['topic'], report['evidence']['statements'][0]['text'], report['transcript'][0]['text'], report['transcript'][-1]['text'], 'Audio segment could not be transcribed.', 'A complete profile based on recorded responses.']:
            self.assertIn(compact(value), compact(text))
        self.assertNotIn('private-provider',text)
        self.assertNotIn('private-participant',text)
        self.assertEqual(report,before)
        self.assertGreaterEqual(len(reader.outline),4)
        fonts = [font.get_object() for page in reader.pages for font in page['/Resources']['/Font'].values()]
        embedded = [font for font in fonts if font.get('/FontDescriptor')]
        self.assertTrue(embedded)
        self.assertTrue(all('/FontFile2' in font['/FontDescriptor'].get_object() for font in embedded))
        names = {str(font.get('/BaseFont')) for font in embedded}
        self.assertTrue(any('Regular' in name for name in names))
        self.assertTrue(any('Bold' in name for name in names))
        uris = [annotation.get_object().get('/A',{}).get('/URI') for page in reader.pages for annotation in page.get('/Annots',[])]
        self.assertIn('https://murmi.example/r/pdf-test',uris)
        self.assertIn('https://murmi.example/?code=PDFTEST',uris)
        for index,page in enumerate(reader.pages,1):
            self.assertAlmostEqual(float(page.mediabox.width),595.2756,places=2)
            self.assertIn(f'Page {index}',page.extract_text())

    def test_long_entry_spans_pages_and_is_not_truncated(self):
        _, report = fixture()
        text = 'START_LONG_ENTRY ' + ('A long recorded statement with complete words. 中文測試。 ' * 220) + ' END_LONG_ENTRY'
        report['transcript'] = [{'text':text,'speaker':'Long recording','timestamp':1700000000}]
        reader = PdfReader(BytesIO(render_report_pdf(report)))
        exported = body_text(reader)
        self.assertIn('START_LONG_ENTRY',exported)
        self.assertIn('END_LONG_ENTRY',exported)
        self.assertEqual(compact(exported).count(compact('A long recorded statement with complete words.')),220)
        self.assertIn(compact(text),compact(exported))
        pages = [page.extract_text() for page in reader.pages]
        self.assertLess(next(i for i, text in enumerate(pages) if 'START_LONG_ENTRY' in text),
                        next(i for i, text in enumerate(pages) if 'END_LONG_ENTRY' in text))

    def test_simultaneous_exports_keep_their_own_text(self):
        reports = [fixture(language)[1] for language in ('zh','de','fr')]
        with ThreadPoolExecutor(max_workers=3) as executor:
            documents = list(executor.map(render_report_pdf, reports))
        for report, data in zip(reports, documents):
            text = body_text(PdfReader(BytesIO(data)))
            self.assertIn(compact(COPY[report['sourceLanguage']]['transcript']), compact(text))
            self.assertIn('déjà vu, Straße, città.',text)

    def test_all_locales_and_legacy_or_empty_transcript(self):
        for language in COPY:
            with self.subTest(language=language):
                _,report = fixture(language)
                text = ''.join(page.extract_text() for page in PdfReader(BytesIO(render_report_pdf(report))).pages)
                self.assertIn(compact(COPY[language]['transcript']),compact(text))
                self.assertIn('中文',text)
        for available in (False,True):
            _,report=fixture()
            if available: report['transcript']=[]
            else: report.pop('transcript')
            text=''.join(page.extract_text() for page in PdfReader(BytesIO(render_report_pdf(report))).pages)
            self.assertIn(COPY['en']['empty' if available else 'legacy'],text)

    def test_download_uses_published_snapshot_and_never_regenerates(self):
        session, report = fixture()
        session.transcript = [{'text':'PRIVATE LATER TRANSCRIPT'}]
        manager = SessionManager()
        manager.sessions[session.id] = session
        with patch.object(main,'sessions',manager), patch.object(main,'db',SimpleNamespace(enabled=False)), \
             patch.object(main.analysis,'generate_report_narrative',new_callable=AsyncMock) as generator:
            client=TestClient(main.app)
            response=client.get('/api/public/results/pdf-test/report.pdf')
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.headers['content-type'],'application/pdf')
            self.assertEqual(response.headers['content-disposition'],'attachment; filename="murmi-PDFTEST-report-v1.pdf"')
            text=''.join(page.extract_text() for page in PdfReader(BytesIO(response.content)).pages)
            self.assertNotIn('PRIVATE LATER TRANSCRIPT',text)
            generator.assert_not_called()
            for status in ('draft_ready','generating','none','failed'):
                session.report_status=status
                self.assertEqual(client.get('/api/public/results/pdf-test/report.pdf').status_code,404)
            self.assertEqual(client.get('/api/public/results/unknown/report.pdf').status_code,404)
            session.report_status='stale'
            report['status']='stale'
            response=client.get('/api/public/results/pdf-test/report.pdf')
            text=''.join(page.extract_text() for page in PdfReader(BytesIO(response.content)).pages)
            self.assertIn('Voting has reopened.',text)

    def test_filename_cannot_inject_headers_or_paths(self):
        _,report=fixture()
        report['meta']['sessionId']='../a\r\nInjected: x/測試'
        self.assertRegex(report_pdf_filename(report),r'^murmi-[A-Za-z0-9_-]+-report-v1\.pdf$')

    def test_group_comparisons_keep_the_same_evidence_guardrails(self):
        groups = [{'id':i,'letter':letter,'size':10,'statements':[
            {'id':'s1','text':'Keep staffed access.','responded':8,'agree':agree,'neutral':1,'disagree':7-agree}
        ]} for i,letter,agree in [(0,'A',7),(1,'B',2)]]
        self.assertEqual(len(select_group_differences(groups)),1)
        _,report = fixture()
        report['opinionLandscape']['groups']=groups
        text=body_text(PdfReader(BytesIO(render_report_pdf(report))))
        self.assertIn('Where groups differ',text)
        self.assertIn('7/8 (88%)',text)
        for key,value in [('responded',4),('responded',11),('agree',-1),('agree',float('nan'))]:
            invalid=deepcopy(groups)
            invalid[0]['statements'][0][key]=value
            self.assertEqual(select_group_differences(invalid),[])

    def test_methodology_localizes_known_definitions_and_preserves_changed_rules(self):
        _,report=fixture('zh')
        report['methodology']['commonGroundRule']='A future rule: 70% support.'
        text=' '.join(methodology_copy(report,'zh'))
        self.assertIn('A future rule: 70% support.',text)
        self.assertIn('同意與非常同意',text)
        self.assertIn('錄音文字與錄音來源標籤',text)
        concise=' '.join(methodology_copy(report,'zh',concise=True))
        self.assertIn('A future rule: 70% support.',concise)
        self.assertNotIn('同意與非常同意',concise)
