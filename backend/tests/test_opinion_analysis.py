import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from backend.app import opinion_analysis as opinions
from backend.app.policy_evidence import build_policy_evidence
from backend.app.reporting import build_opinion_landscape, freeze_report_source, narrative_evidence
from backend.app.session import Session, SessionManager, Statement


def sample_session():
    session = Session(id="opinion-test")
    session.statements = [
        Statement(id="a", text="Improve bus access", round=1, approved=True, created_at=1,
                  votes={"private-3": "agree", "private-1": "agree", "private-2": "disagree"}),
        Statement(id="b", text="Improve road access", round=1, approved=True, created_at=2,
                  votes={"private-1": "neutral", "private-2": "agree"}),
        Statement(id="hidden", text="Not approved", round=1, approved=False),
    ]
    return session


class SharedOpinionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        opinions._cache.clear()
        self.session = sample_session()

    async def test_live_report_and_policy_share_memberships_and_counts(self):
        real_spawn = asyncio.create_subprocess_exec
        with patch.object(opinions.asyncio, "create_subprocess_exec", wraps=real_spawn) as spawn:
            live, report = await asyncio.gather(
                opinions.get_opinion_analysis(self.session),
                build_opinion_landscape(self.session),
            )
            self.assertEqual(spawn.call_count, 1)
        self.assertTrue(report["available"])
        self.assertEqual(live["live"]["landscape"], report)
        self.assertEqual(report["status"], "provisional")
        self.assertEqual(report["eligibleParticipants"], 3)
        self.assertEqual(report["minimumVotes"], 1)
        policy = build_policy_evidence(self.session, report)
        self.assertEqual(policy["opinionSourceHash"], report["sourceHash"])
        self.assertEqual([g["size"] for g in policy["opinionGroups"]], [g["size"] for g in report["groups"]])
        self.assertNotIn("private-", json.dumps(live))
        for name in ("votes", "points", "participantIndex", "coordinates"):
            self.assertNotIn(f'"{name}"', json.dumps(report))
        # A caller cannot corrupt the cache, including nested group statistics.
        report["groups"][0]["size"] = 999
        fresh = await build_opinion_landscape(self.session)
        self.assertNotEqual(fresh["groups"][0]["size"], 999)

    async def test_density_grid_is_saved_but_omitted_from_narrative_input(self):
        landscape = await build_opinion_landscape(self.session)
        evidence = narrative_evidence({"opinionLandscape": landscape})
        for saved, narrated in zip(landscape["groups"], evidence["opinionLandscape"]["groups"]):
            self.assertEqual(len(saved["density"]["values"]), 51 * 51)
            self.assertNotIn("density", narrated)
            self.assertEqual(len(saved["dots"]), saved["size"])
            self.assertNotIn("dots", narrated)
            self.assertEqual(saved["statements"], narrated["statements"])

    def test_report_dots_allow_only_bounded_geometry_without_identifiers(self):
        self.assertFalse(opinions._contains_private_fields({"size": 2, "dots": [{"x": .5, "y": .5}, {"x": .5, "y": .5}]}))
        for dot in ({"x": .5, "y": .5, "key": "person"}, {"x": .5, "y": .5, "answered": 3},
                    {"x": float('nan'), "y": .5}, {"x": 2, "y": .5}, {"x": True, "y": .5}):
            self.assertTrue(opinions._contains_private_fields({"size": 1, "dots": [dot]}))
        self.assertTrue(opinions._contains_private_fields({"size": 2, "dots": [{"x": .5, "y": .5}]}))

    async def test_reordered_restored_session_and_different_viewers_match(self):
        manager = SessionManager()
        manager.sessions[self.session.id] = self.session
        first = manager.vote_matrix(self.session.id, "private-1")
        second = manager.vote_matrix(self.session.id, "private-2")
        self.assertEqual([v["key"] for v in first["voters"]], [v["key"] for v in second["voters"]])
        self.assertNotEqual([v["isYou"] for v in first["voters"]], [v["isYou"] for v in second["voters"]])
        expected = await build_opinion_landscape(self.session)
        self.session.statements.reverse()
        for statement in self.session.statements:
            statement.votes = dict(reversed(list(statement.votes.items())))
        self.assertEqual(await build_opinion_landscape(self.session), expected)

    async def test_snapshot_and_new_vote_have_distinct_fingerprints(self):
        frozen = freeze_report_source(self.session)
        before = await build_opinion_landscape(frozen)
        self.session.statements[1].votes["private-3"] = "neutral"
        after = await build_opinion_landscape(self.session)
        self.assertNotEqual(before["sourceHash"], after["sourceHash"])
        self.assertEqual(before, await build_opinion_landscape(frozen))
        before_missing = sum(s["missing"] for g in before["groups"] for s in g["statements"])
        after_missing = sum(s["missing"] for g in after["groups"] for s in g["statements"])
        self.assertEqual((before_missing, after_missing), (1, 0))

    async def test_runtime_failure_does_not_fall_back_to_another_clustering(self):
        with patch.object(opinions.asyncio, "create_subprocess_exec", side_effect=OSError):
            result = await opinions.get_opinion_analysis(self.session)
        self.assertIsNone(result["live"])
        self.assertEqual(result["landscape"]["reason"], "analysis-runtime-unavailable")
        self.assertEqual(len(opinions._cache), 0)

    async def test_statement_text_is_not_mistaken_for_a_private_field(self):
        self.session.statements[0].text = "votes"
        result = await opinions.get_opinion_analysis(self.session)
        self.assertTrue(result["landscape"]["available"])
        self.assertTrue(opinions._contains_private_fields({"groups": [{"coordinates": [0, 1]}]}))

    async def test_report_privacy_boundary_rejects_individual_points(self):
        process = AsyncMock()
        process.returncode = 0
        process.communicate.return_value = (json.dumps({"landscape": {
            "analysisVersion": opinions.ANALYSIS_VERSION, "points": [{"key": "p1", "x": 0}],
        }, "live": {}}).encode(), b"")
        with patch.object(opinions.asyncio, "create_subprocess_exec", return_value=process):
            result = await opinions.get_opinion_analysis(self.session)
        self.assertEqual(result["landscape"]["reason"], "privacy-boundary-failed")

    async def test_public_endpoint_uses_shared_analysis_and_keeps_published_snapshot(self):
        from backend.app import main
        manager = SessionManager()
        manager.sessions[self.session.id] = self.session
        from backend.app.opinion_themes import OpinionThemeService
        disabled_themes = OpinionThemeService(AsyncMock(), enabled=False)
        with patch.object(main, "sessions", manager), patch.object(main, "opinion_themes", disabled_themes), patch.object(main, "_resolve_public_session", return_value=self.session.id):
            data = await main.public_results("public-fixture")
            report = await build_opinion_landscape(self.session)
            for key, value in report.items():
                self.assertEqual(data["opinionAnalysis"]["landscape"][key], value)
            self.session.report_snapshot = {"opinionLandscape": report}
            self.session.report_status = "published"
            self.session.statements[0].votes["private-3"] = "disagree"
            published = await main.public_results("public-fixture")
            self.assertEqual(published["report"]["opinionLandscape"], report)
            self.assertNotIn("opinionAnalysis", published)
