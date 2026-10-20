package app.flotsam.client

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateManifestParserTest {
    private val sha = "a".repeat(64)
    private fun json(extra: String = "", code: String = "12", url: String = "https://dl.example/f-1.3.0.apk", hash: String = sha) =
        """{"versionCode":$code,"versionName":"1.3.0","apkUrl":"$url","sha256":"$hash"$extra}"""

    @Test fun parsesAValidManifest() {
        val r = UpdateManifestParser.parse(json(""","minSupportedVersionCode":9,"size":22000000,"notes":"Faster gallery""""))
        val m = (r as ManifestResult.Ok).manifest
        assertEquals(12, m.versionCode)
        assertEquals("1.3.0", m.versionName)
        assertEquals(9, m.minSupportedVersionCode)
        assertEquals(22_000_000L, m.size)
        assertEquals("Faster gallery", m.notes)
    }

    @Test fun optionalFieldsDefault() {
        val m = (UpdateManifestParser.parse(json()) as ManifestResult.Ok).manifest
        assertEquals(1, m.minSupportedVersionCode)
        assertEquals(null, m.size)
        assertEquals("", m.notes)
    }

    @Test fun normalisesTheHashToLowercase() {
        val m = (UpdateManifestParser.parse(json(hash = "A".repeat(64))) as ManifestResult.Ok).manifest
        assertEquals(sha, m.sha256)
    }

    @Test fun rejectsBadOrHostileInput() {
        fun bad(text: String) = assertTrue(text, UpdateManifestParser.parse(text) is ManifestResult.Invalid)
        bad("not json")
        bad("{}")
        bad(json(code = "0"))
        bad(json(code = "-3"))
        bad(json(url = "http://dl.example/a.apk"))
        bad(json(url = "ftp://dl.example/a.apk"))
        bad(json(url = "file:///sdcard/a.apk"))
        bad(json(url = "javascript:alert(1)"))
        bad(json(hash = "abc"))
        bad(json(hash = "z".repeat(64)))
        bad(json(""","minSupportedVersionCode":13"""))
        bad(json(""","minSupportedVersionCode":0"""))
        bad(json(""","size":0"""))
        bad("""{"versionCode":2,"versionName":"","apkUrl":"https://x/a.apk","sha256":"$sha"}""")
    }

    @Test fun truncatesAbsurdlyLongNotes() {
        val m = (UpdateManifestParser.parse(json(""","notes":"${"x".repeat(5000)}"""")) as ManifestResult.Ok).manifest
        assertEquals(2000, m.notes.length)
    }
}

class UpdatePolicyTest {
    private fun manifest(code: Int, min: Int) =
        UpdateManifest(code, "v", min, "https://x/a.apk", "a".repeat(64), null, "")

    @Test fun decidesUpToDateAvailableOrForced() {
        assertEquals(UpdateDecision.UP_TO_DATE, UpdatePolicy.decide(12, manifest(12, 9)))
        assertEquals(UpdateDecision.UP_TO_DATE, UpdatePolicy.decide(13, manifest(12, 9)))
        assertEquals(UpdateDecision.AVAILABLE, UpdatePolicy.decide(10, manifest(12, 9)))
        assertEquals(UpdateDecision.AVAILABLE, UpdatePolicy.decide(9, manifest(12, 9)))
        assertEquals(UpdateDecision.FORCED, UpdatePolicy.decide(8, manifest(12, 9)))
    }

    @Test fun neverForcesWhenAlreadyCurrent() {
        assertEquals(UpdateDecision.UP_TO_DATE, UpdatePolicy.decide(12, manifest(12, 12)))
    }
}

class UpdateThrottleTest {
    @Test fun onceADay() {
        val day = UpdateThrottle.INTERVAL_MS
        assertTrue(UpdateThrottle.shouldCheck(0, 1_000))
        assertFalse(UpdateThrottle.shouldCheck(1_000, 1_000 + day - 1))
        assertTrue(UpdateThrottle.shouldCheck(1_000, 1_000 + day))
    }

    @Test fun aClockThatWentBackwardsChecksAgain() {
        assertTrue(UpdateThrottle.shouldCheck(5_000_000, 1_000))
    }
}

class UpdateUrlPolicyTest {
    @Test fun apkMustBeOnTheSameHttpsOriginAsTheManifest() {
        val m = "https://dl.example/app/android/version.json"
        assertTrue(UpdateUrlPolicy.sameOrigin(m, "https://dl.example/app/android/f.apk"))
        assertTrue(UpdateUrlPolicy.sameOrigin(m, "https://DL.EXAMPLE/other/f.apk"))
        assertFalse(UpdateUrlPolicy.sameOrigin(m, "https://evil.example/f.apk"))
        assertFalse(UpdateUrlPolicy.sameOrigin(m, "https://dl.example.evil.example/f.apk"))
        assertFalse(UpdateUrlPolicy.sameOrigin(m, "http://dl.example/f.apk"))
        assertFalse(UpdateUrlPolicy.sameOrigin(m, "https://dl.example:8443/f.apk"))
        assertFalse(UpdateUrlPolicy.sameOrigin("http://dl.example/version.json", "https://dl.example/f.apk"))
        assertFalse(UpdateUrlPolicy.sameOrigin(m, "not a url"))
    }
}

class UpdateRedirectPolicyTest {
    private val origin = "https://github.com/UnlimitedEditing/flotsam/releases/latest/download/version.json"

    @Test fun githubMayRedirectToItsOwnPathsAndCdn() {
        assertTrue(UpdateUrlPolicy.redirectAllowed(origin, "https://github.com/UnlimitedEditing/flotsam/releases/download/v1.0.0/version.json"))
        assertTrue(UpdateUrlPolicy.redirectAllowed(origin, "https://release-assets.githubusercontent.com/github-production-release-asset/1/abc"))
        assertTrue(UpdateUrlPolicy.redirectAllowed(origin, "https://objects.githubusercontent.com/x"))
    }

    @Test fun everythingElseIsRefused() {
        assertFalse(UpdateUrlPolicy.redirectAllowed(origin, "https://evil.example/a.apk"))
        assertFalse(UpdateUrlPolicy.redirectAllowed(origin, "http://github.com/a"))
        assertFalse(UpdateUrlPolicy.redirectAllowed(origin, "http://objects.githubusercontent.com/x"))
        assertFalse(UpdateUrlPolicy.redirectAllowed(origin, "https://githubusercontent.com.evil.example/x"))
        assertFalse(UpdateUrlPolicy.redirectAllowed(origin, "https://evilgithubusercontent.com/x"))
        assertFalse(UpdateUrlPolicy.redirectAllowed(origin, "https://githubusercontent.com/x"))
        assertFalse(UpdateUrlPolicy.redirectAllowed(origin, "https://objects.githubusercontent.com:8443/x"))
        assertFalse(UpdateUrlPolicy.redirectAllowed(origin, "file:///sdcard/a.apk"))
        assertFalse(UpdateUrlPolicy.redirectAllowed(origin, "not a url"))
    }

    @Test fun otherHostsMayOnlyRedirectWithinThemselves() {
        val mine = "https://dl.example/app/version.json"
        assertTrue(UpdateUrlPolicy.redirectAllowed(mine, "https://dl.example/other/version.json"))
        assertFalse(UpdateUrlPolicy.redirectAllowed(mine, "https://objects.githubusercontent.com/x")) // the CDN exemption is github.com only
        assertFalse(UpdateUrlPolicy.redirectAllowed(mine, "https://cdn.example/x"))
    }

    @Test fun resolvesRelativeAndAbsoluteLocations() {
        assertEquals("https://github.com/a/b/c", UpdateUrlPolicy.resolveLocation("https://github.com/x/y", "/a/b/c"))
        assertEquals("https://cdn.example/z", UpdateUrlPolicy.resolveLocation("https://github.com/x/y", "https://cdn.example/z"))
        assertEquals(5, UpdateUrlPolicy.MAX_REDIRECTS)
    }
}

class UpdateDownloadTest {
    @Test fun resumesOnlyFromAUsablePartialFile() {
        assertEquals(0L, UpdateDownload.resumeOffset(0, 100))
        assertEquals(40L, UpdateDownload.resumeOffset(40, 100))
        assertEquals(0L, UpdateDownload.resumeOffset(100, 100))
        assertEquals(0L, UpdateDownload.resumeOffset(150, 100))
        assertEquals(40L, UpdateDownload.resumeOffset(40, null))
    }

    @Test fun appendsOnlyOnA206() {
        assertTrue(UpdateDownload.canAppend(40, 206))
        assertFalse(UpdateDownload.canAppend(40, 200)) // server ignored the range: start over
        assertFalse(UpdateDownload.canAppend(0, 206))
    }
}

class Sha256Test {
    @Test fun hashesAFileAndComparesCaseInsensitively() {
        val f = File.createTempFile("flotsam", ".bin")
        try {
            f.writeText("abc")
            val h = Sha256.ofFile(f)
            assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", h) // SHA-256("abc")
            assertTrue(Sha256.matches(h.uppercase(), h))
            assertFalse(Sha256.matches("0".repeat(64), h))
        } finally {
            f.delete()
        }
    }
}

class ApkCheckTest {
    private val pkg = "app.flotsam.client"

    @Test fun acceptsTheRightPackageAtANewerMatchingVersion() {
        assertEquals(ApkCheck.Verdict.Ok, ApkCheck.verify(pkg, 10, pkg, 12, 12))
    }

    @Test fun rejectsEverythingElse() {
        fun reject(v: ApkCheck.Verdict) = assertTrue(v is ApkCheck.Verdict.Reject)
        reject(ApkCheck.verify(pkg, 10, null, null, 12)) // unreadable
        reject(ApkCheck.verify(pkg, 10, "com.other.app", 12, 12)) // different app
        reject(ApkCheck.verify(pkg, 10, pkg, 11, 12)) // not what the notice promised
        reject(ApkCheck.verify(pkg, 12, pkg, 12, 12)) // not newer
        reject(ApkCheck.verify(pkg, 13, pkg, 12, 12)) // downgrade
    }
}
