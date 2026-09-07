package com.veltrix.calculator.app

import android.content.Context
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Frontend-only runtime guard for the final bounded Liquid Glass presentation layer. */
@RunWith(AndroidJUnit4::class)
class FrontendLiquidGlassRuntimeTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    @Before
    fun isolatePersistedUiState() {
        val cleared = instrumentation.targetContext
            .getSharedPreferences("ui_state", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        assertTrue("Failed to isolate persisted ui_state before frontend runtime test", cleared)
    }

    @Test
    fun homeInteractiveChromeHasMaterialAndAccessibleTouchTargets() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            instrumentation.waitForIdleSync()
            scenario.onActivity { activity ->
                val density = activity.resources.displayMetrics.density
                val minTouch = (48f * density).toInt()
                val decor = activity.window.decorView
                val routeHome = findTagged<View>(decor, "route-home")
                val standardInput = findTagged<EditText>(decor, "standard-input")
                val result = findTagged<View>(decor, "result")
                val allButtons = collect(decor, Button::class.java)
                val visibleButtons = allButtons.filter { it.isShown }
                val buttonTexts = allButtons.map { it.text?.toString().orEmpty() }
                val currentRoute = currentRouteTag(decor)

                println(
                    "FRONTEND_HOME_DIAGNOSTIC " +
                        "route=$currentRoute " +
                        "totalButtons=${allButtons.size} " +
                        "visibleButtons=${visibleButtons.size} " +
                        "standardInput=${standardInput != null} " +
                        "result=${result != null} " +
                        "buttonTexts=$buttonTexts"
                )

                assertNotNull("Home test did not establish route-home; current=$currentRoute", routeHome)
                assertNotNull("Home standard-input missing; current=$currentRoute", standardInput)
                assertNotNull("Home result missing; current=$currentRoute", result)

                val expectedFixedControls = setOf(
                    "Calculate",
                    "7", "8", "9", "/",
                    "4", "5", "6", "*",
                    "1", "2", "3", "-",
                    "0", ".", "(", ")",
                    "+", "^", "%", "!",
                    "⌫"
                )
                val missingFixedControls = expectedFixedControls - buttonTexts.toSet()
                val hasClearControl = buttonTexts.any { it == "AC" || it == "C" }

                assertTrue(
                    "Home calculator control set incomplete; current=$currentRoute missing=$missingFixedControls controls=$buttonTexts",
                    missingFixedControls.isEmpty()
                )
                assertTrue(
                    "Home AC/C control missing; current=$currentRoute controls=$buttonTexts",
                    hasClearControl
                )
                assertTrue(
                    "Home must expose at least 23 calculator controls; current=$currentRoute total=${allButtons.size}",
                    allButtons.size >= 23
                )
                assertTrue(
                    "Home must expose interactive calculator chrome in the viewport; current=$currentRoute visible=${visibleButtons.size}",
                    visibleButtons.size >= 8
                )

                allButtons.forEach { button ->
                    assertNotNull("Glass button background missing: ${button.text}", button.background)
                    assertNotNull("Pressed-depth response missing: ${button.text}", button.stateListAnimator)
                }
                visibleButtons.forEach { button ->
                    assertTrue("Button touch target below 48dp: ${button.text} ${button.height}px<$minTouch", button.height >= minTouch)
                    assertTrue("Clickable control lacks semantics: ${button.text}", !button.contentDescription.isNullOrBlank())
                }

                val inputs = collect(decor, EditText::class.java).filter { it.isShown }
                assertTrue("Calculator input missing", inputs.isNotEmpty())
                inputs.forEach { input ->
                    assertNotNull("Glass field background missing", input.background)
                    assertTrue("Input touch target below 48dp", input.height >= minTouch)
                    assertTrue("Input semantics missing", !input.contentDescription.isNullOrBlank())
                }
            }
        }
    }

    @Test
    fun dynamicWorkspaceKeepsGlassChromeAndSemanticNavigation() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            instrumentation.waitForIdleSync()
            scenario.onActivity { activity ->
                val decor = activity.window.decorView
                assertNotNull(
                    "Dynamic workspace test did not establish isolated Home start; current=${currentRouteTag(decor)}",
                    findTagged<View>(decor, "route-home")
                )
            }

            click(scenario, "home-menu")
            click(scenario, "nav-converters")
            click(scenario, "converter-length")
            instrumentation.waitForIdleSync()
            scenario.onActivity { activity ->
                val decor = activity.window.decorView
                val route = findTagged<View>(decor, "route-converter-detail")
                assertNotNull("Converter detail route missing", route)
                collect(decor, Button::class.java).filter { it.isShown }.forEach { button ->
                    assertNotNull("Dynamic control lost glass material: ${button.text}", button.background)
                    assertTrue("Dynamic clickable control lacks semantics: ${button.text}", !button.contentDescription.isNullOrBlank())
                }
            }
        }
    }

    private fun click(scenario: ActivityScenario<MainActivity>, tag: String) {
        eventually("View '$tag' did not appear") {
            var found = false
            scenario.onActivity { found = findTagged<View>(it.window.decorView, tag) != null }
            found
        }
        scenario.onActivity { activity ->
            val view = requireNotNull(findTagged<View>(activity.window.decorView, tag))
            assertTrue("View '$tag' rejected click", view.performClick())
        }
        instrumentation.waitForIdleSync()
    }

    private fun <T : View> collect(root: View, type: Class<T>): List<T> {
        val result = mutableListOf<T>()
        fun walk(view: View) {
            if (type.isInstance(view)) result += requireNotNull(type.cast(view))
            if (view is ViewGroup) for (i in 0 until view.childCount) walk(view.getChildAt(i))
        }
        walk(root)
        return result
    }

    private fun currentRouteTag(root: View): String? {
        val tag = root.tag?.toString()
        if (!tag.isNullOrBlank() && tag.startsWith("route-")) return tag
        if (root is ViewGroup) {
            for (i in 0 until root.childCount) {
                currentRouteTag(root.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    private fun <T : View> findTagged(root: View, tag: String): T? {
        @Suppress("UNCHECKED_CAST")
        if (root.tag == tag) return root as? T
        if (root is ViewGroup) {
            for (i in 0 until root.childCount) {
                val found = findTagged<T>(root.getChildAt(i), tag)
                if (found != null) return found
            }
        }
        return null
    }

    private fun eventually(message: String, timeoutMs: Long = 6_000, condition: () -> Boolean) {
        val deadline = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < deadline) {
            instrumentation.waitForIdleSync()
            if (condition()) return
            SystemClock.sleep(50)
        }
        assertTrue(message, condition())
    }
}
