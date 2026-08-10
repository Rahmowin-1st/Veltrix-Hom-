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
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RuntimeGateTest {
    private fun <T : View> MainActivity.tagged(tag: String): T {
        @Suppress("UNCHECKED_CAST")
        return window.decorView.findViewWithTag<View>(tag) as T
    }

    private fun waitForResult(scenario: ActivityScenario<MainActivity>, expected: String) {
        repeat(100) {
            var value = ""
            scenario.onActivity { activity ->
                value = activity.tagged<TextView>("result").text.toString()
            }
            if (value == expected) return
            Thread.sleep(50)
        }
        scenario.onActivity { activity ->
            assertEquals(expected, activity.tagged<TextView>("result").text.toString())
        }
    }

    @Test
    fun coldLaunchAndCoreCalculation() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                assertTrue(activity.tagged<EditText>("smart-input").isShown)
                activity.tagged<EditText>("smart-input").setText("2+3*4")
                activity.tagged<Button>("calculate").performClick()
            }
            waitForResult(scenario, "14")
        }
    }

    @Test
    fun navigationWorks() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity -> activity.tagged<Button>("nav-tools").performClick() }
            scenario.onActivity { activity ->
                val found = arrayListOf<View>()
                activity.window.decorView.findViewsWithText(
                    found,
                    "Tools & examples",
                    View.FIND_VIEWS_WITH_TEXT
                )
                assertTrue(found.isNotEmpty())
            }
            scenario.onActivity { activity -> activity.onBackPressed() }
            scenario.onActivity { activity -> assertTrue(activity.tagged<Button>("nav-history").isShown) }
        }
    }

    @Test
    fun historyPersistsAcrossActivityRestart() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        HistoryDb(context).clear()

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                activity.tagged<EditText>("smart-input").setText("25% of 480")
                activity.tagged<Button>("calculate").performClick()
            }
            waitForResult(scenario, "120")
        }

        assertTrue(HistoryDb(context).list().any { it.expression == "25% of 480" && it.result == "120" })

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity -> assertTrue(activity.tagged<Button>("nav-history").isShown) }
        }
        assertTrue(HistoryDb(context).list().any { it.expression == "25% of 480" })
    }

    @Test
    fun advancedCoreWorksOnAndroidRuntime() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                activity.tagged<EditText>("smart-input").setText("x^2+1=0")
                activity.tagged<Button>("calculate").performClick()
            }

            repeat(100) {
                var value = ""
                scenario.onActivity { activity ->
                    value = activity.tagged<TextView>("result").text.toString()
                }
                if (value.contains("i")) return@use
                Thread.sleep(50)
            }
            scenario.onActivity { activity ->
                assertTrue(activity.tagged<TextView>("result").text.toString().contains("i"))
            }
        }
    }
}
