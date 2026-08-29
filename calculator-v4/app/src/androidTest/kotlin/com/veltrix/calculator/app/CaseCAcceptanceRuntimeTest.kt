package com.veltrix.calculator.app

import android.graphics.Rect
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.GridLayout
import android.widget.ScrollView
import android.widget.Spinner
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.FileInputStream

/** Recovered canonical Case-C acceptance: AC-24/25/26/63/64/65/66/101. */
@RunWith(AndroidJUnit4::class)
class CaseCAcceptanceRuntimeTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    @Test
    fun toolEnvironmentIsPagedNoScrollAndFullFrame() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            click(scenario, "home-menu")
            click(scenario, "tool-physics-ohms-law")
            val route = tagged<ViewGroup>(scenario, "route-tool-physics-ohms-law")
            assertEquals("Tool route must not contain vertical page scrolling", 0, descendantsOfType<ScrollView>(route))
            assertTrue("Complex tool must expose adaptive paging", hasTag(scenario, "tool-page-label"))
            assertTrue("Complex tool must expose Next page", hasTag(scenario, "tool-page-next"))
            val params = route.layoutParams
            assertEquals(ViewGroup.LayoutParams.MATCH_PARENT, params.width)
            assertEquals(ViewGroup.LayoutParams.MATCH_PARENT, params.height)
            assertFullyVisible(scenario, "tool-page-label")
            assertFullyVisible(scenario, "tool-page-next")
            assertFullyVisible(scenario, "detail-back")

            click(scenario, "tool-page-next")
            assertTrue(hasTag(scenario, "tool-page-prev"))
            assertEquals(0, descendantsOfType<ScrollView>(tagged(scenario, "route-tool-physics-ohms-law")))
        }
    }

    @Test
    fun largeTextUsesSingleInputPagesWithoutClipping() {
        val original = shell("settings get system font_scale").ifBlank { "1.0" }
        try {
            shell("settings put system font_scale 1.30")
            SystemClock.sleep(600)
            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                click(scenario, "home-menu")
                click(scenario, "tool-physics-ohms-law")
                var scale = 0f
                scenario.onActivity { scale = it.resources.configuration.fontScale }
                assertTrue("Large-text configuration was not active: $scale", scale >= 1.15f)
                assertEquals("Large text must reduce each input page to one field", 1, countTagPrefix(scenario, "tool-input-"))
                assertEquals(0, descendantsOfType<ScrollView>(tagged(scenario, "route-tool-physics-ohms-law")))
                assertFullyVisible(scenario, "tool-page-label")
                assertFullyVisible(scenario, "tool-page-next")
                assertFullyVisible(scenario, "detail-back")
            }
        } finally {
            shell("settings put system font_scale $original")
            SystemClock.sleep(300)
        }
    }

    @Test
    fun converterRootIsGridWithMetadataAndSwapIsDeterministic() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            click(scenario, "home-menu")
            click(scenario, "nav-converters")
            val grid = tagged<GridLayout>(scenario, "converter-grid")
            assertEquals(2, grid.columnCount)

            val length = tagged<Button>(scenario, "converter-length")
            assertTrue(length.text.contains("Length"))
            assertTrue("Category description missing", length.text.lines().size >= 3)
            val semantics = length.contentDescription.toString()
            assertTrue("Distinctive icon metadata missing", semantics.contains("icon=converter-length"))
            assertTrue("Sample-pair metadata missing", semantics.contains("sample=") && semantics.contains(" to "))

            click(scenario, "converter-length")
            val fromBefore = tagged<Spinner>(scenario, "converter-from").selectedItemPosition
            val toBefore = tagged<Spinner>(scenario, "converter-to").selectedItemPosition
            assertTrue("Swap proof requires two different selected units", fromBefore != toBefore)
            click(scenario, "converter-swap")
            assertEquals(toBefore, tagged<Spinner>(scenario, "converter-from").selectedItemPosition)
            assertEquals(fromBefore, tagged<Spinner>(scenario, "converter-to").selectedItemPosition)

            scenario.recreate()
            assertEquals(toBefore, tagged<Spinner>(scenario, "converter-from").selectedItemPosition)
            assertEquals(fromBefore, tagged<Spinner>(scenario, "converter-to").selectedItemPosition)
        }
    }

    private fun click(scenario: ActivityScenario<MainActivity>, tag: String) {
        eventually("View '$tag' not available") { hasTag(scenario, tag) }
        scenario.onActivity {
            val view = requireTagged<View>(it, tag)
            assertTrue("View '$tag' hidden", view.isShown)
            assertTrue("View '$tag' rejected click", view.performClick())
        }
        instrumentation.waitForIdleSync()
    }

    private fun hasTag(scenario: ActivityScenario<MainActivity>, tag: String): Boolean {
        var found = false
        runCatching { scenario.onActivity { found = it.window.decorView.findViewWithTag<View>(tag) != null } }
        return found
    }

    private inline fun <reified T : View> tagged(scenario: ActivityScenario<MainActivity>, tag: String): T {
        var value: T? = null
        scenario.onActivity { value = requireTagged(it, tag) }
        return requireNotNull(value)
    }

    private inline fun <reified T : View> requireTagged(activity: MainActivity, tag: String): T {
        val view = activity.window.decorView.findViewWithTag<View>(tag)
        assertNotNull("Missing view tag '$tag'", view)
        assertTrue("Wrong type for '$tag': ${view?.javaClass?.name}", view is T)
        return view as T
    }

    private inline fun <reified T : View> descendantsOfType(root: View): Int {
        var count = if (root is T) 1 else 0
        if (root is ViewGroup) for (i in 0 until root.childCount) count += descendantsOfType<T>(root.getChildAt(i))
        return count
    }

    private fun countTagPrefix(scenario: ActivityScenario<MainActivity>, prefix: String): Int {
        var count = 0
        scenario.onActivity { count = countTagPrefix(it.window.decorView, prefix) }
        return count
    }

    private fun countTagPrefix(view: View, prefix: String): Int {
        var count = if ((view.tag as? String)?.startsWith(prefix) == true) 1 else 0
        if (view is ViewGroup) for (i in 0 until view.childCount) count += countTagPrefix(view.getChildAt(i), prefix)
        return count
    }

    private fun assertFullyVisible(scenario: ActivityScenario<MainActivity>, tag: String) {
        scenario.onActivity { activity ->
            val view = requireTagged<View>(activity, tag)
            val rect = Rect()
            assertTrue("'$tag' has no visible global rect", view.getGlobalVisibleRect(rect))
            assertTrue("'$tag' vertically clipped: visible=${rect.height()} view=${view.height}", rect.height() >= view.height - 2)
            assertTrue("'$tag' horizontally clipped: visible=${rect.width()} view=${view.width}", rect.width() >= view.width - 2)
        }
    }

    private fun shell(command: String): String {
        val descriptor = instrumentation.uiAutomation.executeShellCommand(command)
        return try {
            FileInputStream(descriptor.fileDescriptor).bufferedReader().use { it.readText().trim() }
        } finally {
            runCatching { descriptor.close() }
        }
    }

    private inline fun eventually(message: String, timeoutMs: Long = 6_000, condition: () -> Boolean) {
        val deadline = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < deadline) {
            if (runCatching(condition).getOrDefault(false)) return
            SystemClock.sleep(50)
        }
        assertTrue(message, condition())
    }
}
