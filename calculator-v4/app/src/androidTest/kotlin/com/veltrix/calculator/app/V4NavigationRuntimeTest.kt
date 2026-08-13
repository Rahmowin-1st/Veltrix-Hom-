package com.veltrix.calculator.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * V4 NAV-01..NAV-25 runtime acceptance.
 *
 * Pure state transitions are exhaustively covered by AppNavigationStateTest. This
 * class proves that the Android Activity, system IME, Back dispatcher, deep links,
 * saved state and rendered view hierarchy obey that model on a real device.
 */
@RunWith(AndroidJUnit4::class)
class V4NavigationRuntimeTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context get() = instrumentation.targetContext

    @Test
    fun nav01To05_homeWorkspacePrimaryTabsAndBack() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            assertRoute(scenario, "route-home")
            click(scenario, "home-menu")
            assertWorkspace(scenario, "route-workspace-library")

            listOf(
                "nav-converters" to "route-workspace-converters",
                "nav-graphs" to "route-workspace-graphs",
                "nav-history" to "route-workspace-history"
            ).forEach { (tab, route) ->
                click(scenario, tab)
                assertWorkspace(scenario, route)
                appBack(scenario)
                assertRoute(scenario, "route-home")
                click(scenario, "home-menu")
                assertWorkspace(scenario, "route-workspace-library")
            }
        }
    }

    @Test
    fun nav06Nav07Nav14_settingsRememberTabAndWidgetCenterParentsSettings() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            click(scenario, "home-menu")
            click(scenario, "nav-settings")
            assertWorkspace(scenario, "route-settings")
            appBack(scenario)
            assertWorkspace(scenario, "route-workspace-library")

            click(scenario, "nav-converters")
            click(scenario, "nav-settings")
            assertWorkspace(scenario, "route-settings")
            click(scenario, "settings-widgets")
            assertWorkspace(scenario, "route-widget-center")
            appBack(scenario)
            assertWorkspace(scenario, "route-settings")
            appBack(scenario)
            assertWorkspace(scenario, "route-workspace-converters")
        }
    }

    @Test
    fun nav08Nav09_systemImeShowsAndFirstBackDismissesWithoutLeavingLibrary() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            click(scenario, "home-menu")
            scenario.onActivity { activity ->
                val search = requireTagged<EditText>(activity, "library-search")
                assertTrue(search.requestFocus())
                val input = activity.getSystemService(InputMethodManager::class.java)
                assertTrue("System IME refused the focused Library search field", input.showSoftInput(search, InputMethodManager.SHOW_IMPLICIT))
            }
            eventually("Android system IME never became visible", 8_000) { imeVisible(scenario) }

            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
            eventually("First Back did not dismiss the Android system IME", 8_000) { !imeVisible(scenario) }
            assertWorkspace(scenario, "route-workspace-library")
        }
    }

    @Test
    fun nav10Nav17Nav19_toolStateRestoresAndBackReturnsSameLibraryState() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            click(scenario, "home-menu")
            setText(scenario, "library-search", "ohm")
            click(scenario, "library-search-clear")
            assertEquals("", text(scenario, "library-search"))
            setText(scenario, "library-search", "ohm")
            click(scenario, "tool-physics-ohms-law")
            assertWorkspace(scenario, "route-tool-physics-ohms-law")
            setText(scenario, "tool-input-V", "12")

            scenario.recreate()
            assertWorkspace(scenario, "route-tool-physics-ohms-law")
            assertEquals("12", text(scenario, "tool-input-V"))
            appBack(scenario)
            assertWorkspace(scenario, "route-workspace-library")
            assertEquals("ohm", text(scenario, "library-search"))
            assertEquals(1, countTag(scenario, "workspace-bottom-nav"))

            scenario.recreate()
            assertWorkspace(scenario, "route-workspace-library")
            assertEquals("ohm", text(scenario, "library-search"))
            assertEquals(1, countTag(scenario, "workspace-bottom-nav"))
        }
    }

    @Test
    fun nav11Nav12Nav18_converterAndGraphRestoreTheirSemanticParents() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            click(scenario, "home-menu")
            click(scenario, "nav-converters")
            click(scenario, "converter-length")
            assertWorkspace(scenario, "route-converter-detail")
            setText(scenario, "converter-amount", "123.5")
            scenario.recreate()
            assertWorkspace(scenario, "route-converter-detail")
            assertEquals("123.5", text(scenario, "converter-amount"))
            appBack(scenario)
            assertWorkspace(scenario, "route-workspace-converters")
            click(scenario, "converter-length")
            assertEquals("123.5", text(scenario, "converter-amount"))
            appBack(scenario)

            click(scenario, "nav-graphs")
            click(scenario, "graph-graph-functions")
            assertWorkspace(scenario, "route-tool-graph-functions")
            scenario.recreate()
            assertWorkspace(scenario, "route-tool-graph-functions")
            appBack(scenario)
            assertWorkspace(scenario, "route-workspace-graphs")
        }
    }

    @Test
    fun nav13_historyReopenBackReturnsHistory() {
        HistoryDb(context).clear()
        val historyId = HistoryDb(context).addStructured(
            toolId = "physics-ohms-law",
            subject = "Physics",
            expression = "V=12, R=4",
            resultSummary = "3 A",
            structuredInput = "{\"V\":\"12\",\"R\":\"4\"}",
            normalizedInput = "{\"V\":\"12\",\"R\":\"4\"}",
            resultPayload = "{\"I\":\"3\"}",
            resultVersion = 1,
            units = "A",
            metadata = "{\"navRuntime\":true}"
        )
        assertTrue(historyId > 0)

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            click(scenario, "home-menu")
            click(scenario, "nav-history")
            eventually("Seeded history row was not rendered") { hasTag(scenario, "history-open-$historyId") }
            click(scenario, "history-open-$historyId")
            assertWorkspace(scenario, "route-history-detail")
            click(scenario, "history-reopen")
            assertWorkspace(scenario, "route-tool-physics-ohms-law")
            appBack(scenario)
            assertWorkspace(scenario, "route-workspace-history")
        }
    }

    @Test
    fun nav21Nav22_deepLinksBuildCorrectParentChains() {
        val toolIntent = Intent(Intent.ACTION_VIEW, Uri.parse("veltrix://tool/physics-ohms-law"), context, MainActivity::class.java)
        ActivityScenario.launch<MainActivity>(toolIntent).use { scenario ->
            assertWorkspace(scenario, "route-tool-physics-ohms-law")
            appBack(scenario)
            assertWorkspace(scenario, "route-workspace-library")
            appBack(scenario)
            assertRoute(scenario, "route-home")
        }

        val converterIntent = Intent(Intent.ACTION_VIEW, Uri.parse("veltrix://converter/${Uri.encode("Length")}"), context, MainActivity::class.java)
        ActivityScenario.launch<MainActivity>(converterIntent).use { scenario ->
            assertWorkspace(scenario, "route-converter-detail")
            appBack(scenario)
            assertWorkspace(scenario, "route-workspace-converters")
        }
    }

    @Test
    fun nav15Nav16Nav20Nav23Nav24Nav25_stressIsBoundedAndRootBackFinishes() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            click(scenario, "home-menu")
            repeat(30) {
                click(scenario, "nav-converters")
                click(scenario, "nav-graphs")
                click(scenario, "nav-history")
                click(scenario, "nav-library")
            }
            assertWorkspace(scenario, "route-workspace-library")
            assertEquals(1, countTag(scenario, "workspace-shell"))
            assertEquals(1, countTag(scenario, "workspace-bottom-nav"))
            appBack(scenario)
            assertRoute(scenario, "route-home")
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
            eventually("Root Back did not finish MainActivity", 8_000) {
                scenario.state == androidx.lifecycle.Lifecycle.State.DESTROYED
            }
        }

        repeat(12) {
            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                assertRoute(scenario, "route-home")
                click(scenario, "home-menu")
                assertWorkspace(scenario, "route-workspace-library")
                appBack(scenario)
                assertRoute(scenario, "route-home")
            }
        }
    }

    private fun click(scenario: ActivityScenario<MainActivity>, tag: String) {
        eventually("View '$tag' was not available for click") { hasTag(scenario, tag) }
        scenario.onActivity { activity ->
            val view = requireTagged<View>(activity, tag)
            assertTrue("View '$tag' is hidden", view.isShown)
            assertTrue("View '$tag' rejected performClick", view.performClick())
        }
    }

    private fun appBack(scenario: ActivityScenario<MainActivity>) {
        scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        instrumentation.waitForIdleSync()
    }

    private fun setText(scenario: ActivityScenario<MainActivity>, tag: String, value: String) {
        scenario.onActivity { requireTagged<EditText>(it, tag).setText(value) }
        instrumentation.waitForIdleSync()
    }

    private fun text(scenario: ActivityScenario<MainActivity>, tag: String): String {
        var result: String? = null
        scenario.onActivity { result = requireTagged<EditText>(it, tag).text.toString() }
        return result.orEmpty()
    }

    private fun assertRoute(scenario: ActivityScenario<MainActivity>, tag: String) {
        eventually("Expected route '$tag' was not rendered") { hasTag(scenario, tag) }
    }

    private fun assertWorkspace(scenario: ActivityScenario<MainActivity>, route: String) {
        assertRoute(scenario, route)
        assertEquals(1, countTag(scenario, "workspace-shell"))
        assertEquals(1, countTag(scenario, "workspace-bottom-nav"))
    }

    private fun hasTag(scenario: ActivityScenario<MainActivity>, tag: String): Boolean {
        var found = false
        runCatching {
            scenario.onActivity { found = it.window.decorView.findViewWithTag<View>(tag) != null }
        }
        return found
    }

    private fun countTag(scenario: ActivityScenario<MainActivity>, tag: String): Int {
        var count = 0
        scenario.onActivity { count = countTagged(it.window.decorView, tag) }
        return count
    }

    private fun countTagged(view: View, tag: String): Int {
        var count = if (view.tag == tag) 1 else 0
        if (view is ViewGroup) for (index in 0 until view.childCount) count += countTagged(view.getChildAt(index), tag)
        return count
    }

    private fun imeVisible(scenario: ActivityScenario<MainActivity>): Boolean {
        if (Build.VERSION.SDK_INT < 23) return false
        var visible = false
        scenario.onActivity { activity ->
            visible = activity.window.decorView.rootWindowInsets?.isVisible(WindowInsets.Type.ime()) == true
        }
        return visible
    }

    private inline fun eventually(message: String, timeoutMs: Long = 6_000, condition: () -> Boolean) {
        val deadline = SystemClock.uptimeMillis() + timeoutMs
        var lastError: Throwable? = null
        while (SystemClock.uptimeMillis() < deadline) {
            try {
                if (condition()) return
            } catch (error: Throwable) {
                lastError = error
            }
            SystemClock.sleep(50)
        }
        if (lastError != null) throw AssertionError(message, lastError)
        assertTrue(message, condition())
    }

    private inline fun <reified T : View> requireTagged(activity: MainActivity, tag: String): T {
        val view = activity.window.decorView.findViewWithTag<View>(tag)
        assertNotNull("Missing view tag '$tag'", view)
        assertTrue("View '$tag' was ${view?.javaClass?.name}, expected ${T::class.java.name}", view is T)
        return view as T
    }
}
