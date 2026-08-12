package com.veltrix.calculator.app

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FrontendQ2AdditionalVisualEvidenceTest {
    private val S = Q2EvidenceSupport

    private fun showScreen(scenario: ActivityScenario<MainActivity>, screen: String) {
        scenario.onActivity { S.invoke(it, "showScreen", screen, false) }
        Thread.sleep(220)
    }

    private fun capture(name: String) {
        S.instrumentation.waitForIdleSync()
        Thread.sleep(120)
        S.screenshot(name)
    }

    @Test
    fun additionalGuaranteedRealFrames() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            showScreen(scenario, "standard")
            capture("56_overflow_standard_control_environment")

            showScreen(scenario, "converters")
            capture("57_overflow_converter_hub_environment")

            showScreen(scenario, "library")
            capture("58_overflow_library_environment")

            showScreen(scenario, "graph")
            capture("59_overflow_graph_environment")

            showScreen(scenario, "settings")
            capture("60_overflow_settings_environment")
        }
    }
}
