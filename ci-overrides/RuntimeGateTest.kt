package com.veltrix.calculator.app

import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.FixMethodOrder
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.MethodSorters

@RunWith(AndroidJUnit4::class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class RuntimeGateTest {
    private fun <T : View> MainActivity.tagged(tag: String): T {
        @Suppress("UNCHECKED_CAST")
        return window.decorView.findViewWithTag<View>(tag) as T
    }

    private fun waitForResult(
        scenario: ActivityScenario<MainActivity>,
        predicate: (String) -> Boolean,
        timeoutMs: Long = 12_000L
    ): String {
        val deadline = System.currentTimeMillis() + timeoutMs
        var value = ""
        while (System.currentTimeMillis() < deadline) {
            scenario.onActivity { activity -> value = activity.tagged<TextView>("result").text.toString() }
            if (predicate(value)) return value
            Thread.sleep(75)
        }
        return value
    }

    private fun calculate(scenario: ActivityScenario<MainActivity>, expression: String): String {
        scenario.onActivity { activity ->
            activity.tagged<EditText>("smart-input").setText(expression)
            activity.tagged<Button>("calculate").performClick()
        }
        return waitForResult(scenario, { it != "…" })
    }

    @Test
    fun aColdLaunchAndCoreCalculation() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity -> assertTrue(activity.tagged<EditText>("smart-input").isShown) }
            assertEquals("14", calculate(scenario, "2+3*4"))
        }
    }

    @Test
    fun bNavigationWorks() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity -> activity.tagged<Button>("nav-tools").performClick() }
            scenario.onActivity { activity ->
                val found = arrayListOf<View>()
                activity.window.decorView.findViewsWithText(found, "Tools & examples", View.FIND_VIEWS_WITH_TEXT)
                assertTrue(found.isNotEmpty())
            }
            scenario.onActivity { activity -> activity.onBackPressed() }
            scenario.onActivity { activity -> assertTrue(activity.tagged<Button>("nav-history").isShown) }
        }
    }

    @Test
    fun cAdvancedCoreWorksOnAndroidRuntime() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            val result = calculate(scenario, "x^2+1=0")
            assertTrue("Expected complex polynomial roots, got: $result", result.contains("i"))
        }
    }

    @Test
    fun dHistorySeedThroughUi() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        HistoryDb(context).clear()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            assertEquals("120", calculate(scenario, "25% of 480"))
        }
        assertTrue(HistoryDb(context).list().any { it.expression == "25% of 480" && it.result == "120" })
    }

    @Test
    fun eHistoryVisibleFromPersistentDatabase() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assertTrue(
            "Expected persisted history entry after process restart",
            HistoryDb(context).list().any { it.expression == "25% of 480" && it.result == "120" }
        )
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity -> activity.tagged<Button>("nav-history").performClick() }
            scenario.onActivity { activity ->
                val expressionViews = arrayListOf<View>()
                activity.window.decorView.findViewsWithText(
                    expressionViews,
                    "25% of 480",
                    View.FIND_VIEWS_WITH_TEXT
                )
                assertTrue("Persisted expression not visible in History UI", expressionViews.isNotEmpty())
            }
        }
    }

    @Test
    fun fOfflineCoreSurvivesNetworkCapabilityFailure() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.getSharedPreferences("currency_cache", 0).edit().clear().commit()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            assertEquals("42", calculate(scenario, "7*6"))
            val liveResult = calculate(scenario, "100 USD to EUR")
            assertEquals("Error", liveResult)
            scenario.onActivity { activity ->
                assertTrue(activity.tagged<TextView>("detail").text.toString().contains("NETWORK"))
            }
            assertEquals("42", calculate(scenario, "6*7"))
        }
    }
}
