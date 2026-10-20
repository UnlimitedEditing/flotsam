package app.flotsam.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SseTest {
    @Test fun parsesEventAndDataShapeAndAliases() {
        val e = Sse.parseLine("""data: {"event":"done","data":{"render_hash":"abc"}}""")!!
        assertEquals("rendering_done", e.name)
        assertEquals("abc", e.data.getString("render_hash"))
        assertEquals("rendering_started", Sse.parseLine("""{"event":"started"}""")!!.name)
    }

    @Test fun parsesWrappedShape() {
        val e = Sse.parseLine("""data: {"render_queued":{"render_hash":"h1","estimated_render_time":30}}""")!!
        assertEquals("render_queued", e.name)
        assertEquals("h1", Sse.renderHash(e))
        assertEquals("rendering_error", Sse.parseLine("""{"rendering_error":{"message":"boom"}}""")!!.name)
    }

    @Test fun fallsBackToFirstKeyForUnknownEvents() {
        assertEquals("progress", Sse.parseLine("""{"progress":{"pct":5}}""")!!.name)
    }

    @Test fun ignoresBlankDoneAndJunk() {
        assertNull(Sse.parseLine(""))
        assertNull(Sse.parseLine("data: [DONE]"))
        assertNull(Sse.parseLine("not json"))
    }

    @Test fun onlyQueuedAndDoneCarryAHash() {
        assertNull(Sse.renderHash(Sse.parseLine("""{"rendering_started":{"render_hash":"x"}}""")!!))
        assertNotNull(Sse.renderHash(Sse.parseLine("""{"rendering_done":{"render_hash":"x"}}""")!!))
        assertNull(Sse.renderHash(Sse.parseLine("""{"render_queued":{}}""")!!))
    }
}

class RenderStatusTest {
    @Test fun detectsMediaInPlainAndJsonApiShapes() {
        assertTrue(RenderStatus.hasMedia("""{"images":[{"url":"https://x/a.png"}]}"""))
        assertTrue(RenderStatus.hasMedia("""{"data":{"attributes":{"images":[{"media":[{"url":"https://x/v.mp4"}]}]}}}"""))
    }

    @Test fun notFinishedWithoutAUrl() {
        assertFalse(RenderStatus.hasMedia("""{"images":[]}"""))
        assertFalse(RenderStatus.hasMedia("""{"images":[{"url":""}]}"""))
        assertFalse(RenderStatus.hasMedia("""{"images":[{"media":[]}]}"""))
        assertFalse(RenderStatus.hasMedia("""{}"""))
        assertFalse(RenderStatus.hasMedia("garbage"))
    }
}

class HostPolicyTest {
    @Test fun apiCallsOnlyToAllowedHttpsHosts() {
        assertTrue(HostPolicy.isApiAllowed("https://app.graydient.ai/api/v3/render/"))
        assertTrue(HostPolicy.isApiAllowed("https://catbox.moe/user/api.php"))
        assertTrue(HostPolicy.isApiAllowed("https://modeltrends.ai/v1/model/7d01a45e.json"))
        assertFalse(HostPolicy.isApiAllowed("http://app.graydient.ai/api/v3/"))
        assertFalse(HostPolicy.isApiAllowed("https://evil.example/api/v3/"))
        assertFalse(HostPolicy.isApiAllowed("https://app.graydient.ai.evil.example/"))
        assertFalse(HostPolicy.isApiAllowed("file:///etc/passwd"))
        assertFalse(HostPolicy.isApiAllowed("not a url"))
    }

    @Test fun theApiKeyOnlyGoesToGraydient() {
        assertTrue(HostPolicy.mayCarryAuth("https://app.graydient.ai/api/v3/workflows/"))
        assertFalse(HostPolicy.mayCarryAuth("https://catbox.moe/user/api.php"))
        assertFalse(HostPolicy.mayCarryAuth("https://modeltrends.ai/v1/x.json"))
    }

    @Test fun downloadsNeedHttpsButNotAnAllowlist() {
        assertTrue(HostPolicy.isDownloadAllowed("https://piratediffusion1.s3.amazonaws.com/renders2/a/b.png"))
        assertFalse(HostPolicy.isDownloadAllowed("http://example.com/a.png"))
        assertFalse(HostPolicy.isDownloadAllowed("content://media/external/1"))
    }
}

class NotificationTextTest {
    @Test fun wordingIsGenericAndNeutralInDiscreetMode() {
        val normal = NotificationText.choose(discreet = false, ok = true)
        assertEquals("Flotsam", normal.title)
        assertEquals("Your render is ready", normal.body)
        val quiet = NotificationText.choose(discreet = true, ok = true)
        assertEquals("Reminder", quiet.title)
        assertEquals("Ready", quiet.body)
        assertEquals("Needs attention", NotificationText.choose(true, false).body)
        assertFalse((quiet.title + quiet.body).lowercase().contains("flotsam"))
        assertFalse((quiet.title + quiet.body).lowercase().contains("render"))
    }
}

class PendingJobsTest {
    private val a = PendingJob("j1", "h1", 1_000)
    private val b = PendingJob("j2", "h2", 2_000)

    @Test fun roundTripsAndToleratesBadData() {
        assertEquals(listOf(a, b), PendingJobs.fromJson(PendingJobs.toJson(listOf(a, b))))
        assertTrue(PendingJobs.fromJson(null).isEmpty())
        assertTrue(PendingJobs.fromJson("not json").isEmpty())
        assertEquals(listOf(a), PendingJobs.fromJson("""[{"jobId":"j1","renderHash":"h1","startedAt":1000},{"jobId":"","renderHash":"x"}]"""))
    }

    @Test fun addRefreshesByJobIdAndRemoveDrops() {
        val updated = PendingJobs.add(listOf(a, b), PendingJob("j1", "h1b", 3_000))
        assertEquals(listOf(b, PendingJob("j1", "h1b", 3_000)), updated)
        assertEquals(listOf(b), PendingJobs.remove(listOf(a, b), "j1"))
    }

    @Test fun dropsJobsOlderThanSixHours() {
        val now = PendingJobs.MAX_AGE_MS + 5_000
        val fresh = PendingJob("j3", "h3", now - 1_000)
        assertEquals(listOf(fresh), PendingJobs.expire(listOf(a, b, fresh), now))
    }

    @Test fun verdictFromTheHttpOutcome() {
        assertEquals(PendingJobs.Verdict.NOTIFY_DONE, PendingJobs.verdict(200, true))
        assertEquals(PendingJobs.Verdict.KEEP, PendingJobs.verdict(200, false))
        assertEquals(PendingJobs.Verdict.KEEP, PendingJobs.verdict(500, false))
        assertEquals(PendingJobs.Verdict.KEEP, PendingJobs.verdict(401, false))
        assertEquals(PendingJobs.Verdict.DROP, PendingJobs.verdict(404, false))
        assertEquals(PendingJobs.Verdict.DROP, PendingJobs.verdict(410, false))
    }
}
