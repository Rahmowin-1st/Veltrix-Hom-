package com.veltrix.calculator.app

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.veltrix.calculator.app.frontend.NoImeEditText
import com.veltrix.calculator.core.AdaptiveState
import com.veltrix.calculator.core.PlatformEngine
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FrontendQ2FinalEvidenceTest {
    private val S = Q2EvidenceSupport
    private val platform = PlatformEngine()

    private fun capture(scenario: ActivityScenario<MainActivity>, name: String) {
        S.instrumentation.waitForIdleSync(); Thread.sleep(100); S.screenshot(name)
    }
    private fun clickDescription(scenario: ActivityScenario<MainActivity>, desc: String) {
        scenario.onActivity { activity -> (S.findByDescription(activity.window.decorView, desc) ?: error("Missing $desc")).performClick() }
        Thread.sleep(220)
    }
    private fun showScreen(scenario: ActivityScenario<MainActivity>, screen: String) {
        scenario.onActivity { S.invoke(it, "showScreen", screen, false) }; Thread.sleep(180)
    }
    private fun openTool(scenario: ActivityScenario<MainActivity>, id: String) {
        val tool = platform.registry.get(id) ?: error("Missing tool $id")
        scenario.onActivity { S.invoke(it, "openTool", tool) }; Thread.sleep(220)
    }
    private fun setText(scenario: ActivityScenario<MainActivity>, tag: String, value: String) {
        scenario.onActivity { activity ->
            val v = S.findByTag(activity.window.decorView, tag) as? TextView ?: error("Missing text $tag")
            v.text = value; if (v is NoImeEditText) v.setSelection(v.text.length)
        }
    }
    private fun clickTag(scenario: ActivityScenario<MainActivity>, tag: String) {
        scenario.onActivity { activity -> (S.findByTag(activity.window.decorView, tag) ?: error("Missing $tag")).performClick() }; Thread.sleep(300)
    }
    private fun seedAdaptive() {
        PersonalizationStore(S.targetContext).save(AdaptiveState(recentToolIds = listOf("quadratic-solver", "vieta", "ohms-law", "statistics-dataset", "compound-interest")))
    }

    @Test fun aVisualCoreMatrix() {
        S.clearEvidence()
        S.targetContext.getSharedPreferences("calculator_settings", 0).edit().clear().commit()
        S.targetContext.getSharedPreferences("adaptive_state", 0).edit().clear().commit()
        CurrencyCacheStore(S.targetContext).put(ProviderRate("USD", "UZS", 12650.0, "2026-08-12", "q2-evidence"), System.currentTimeMillis())
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            capture(scenario, "01_standard_empty")
            setText(scenario, "standard-input", "25*48"); capture(scenario, "02_standard_active_expression")
            clickTag(scenario, "calculate"); capture(scenario, "03_standard_result")
            setText(scenario, "standard-input", "123456789*987654321+1/7"); clickTag(scenario, "calculate"); capture(scenario, "04_standard_long_expression_result")
            scenario.onActivity { S.dispatchSegment(S.findByTag(it.window.decorView, "calculator_mode_segmented")!!, 1, 3) }; Thread.sleep(180); capture(scenario, "05_scientific")
            scenario.onActivity { S.dispatchSegment(S.findByTag(it.window.decorView, "calculator_mode_segmented")!!, 2, 3) }; Thread.sleep(180); capture(scenario, "06_programmer")
            scenario.onActivity { S.dispatchSegment(S.findByTag(it.window.decorView, "calculator_mode_segmented")!!, 0, 3) }; Thread.sleep(140)
            clickDescription(scenario, "Main Brain"); capture(scenario, "07_main_brain")
            seedAdaptive(); scenario.onActivity { S.invoke(it, "refreshBrainAdaptive") }; capture(scenario, "08_main_brain_last_used_5")
            showScreen(scenario, "converters"); capture(scenario, "09_converters_hub")
            scenario.onActivity { S.invoke(it, "showCurrencyEnvironment") }; Thread.sleep(260); capture(scenario, "10_currency_fresh")
            CurrencyCacheStore(S.targetContext).put(ProviderRate("USD", "UZS", 12590.0, "2026-08-01", "q2-cache"), System.currentTimeMillis() - 86_400_000L)
            scenario.onActivity { S.invoke(it, "refreshCurrency", false) }; Thread.sleep(200); capture(scenario, "11_currency_stale_offline")
            scenario.onActivity { S.invoke(it, "showConverterEnvironment", "length") }; Thread.sleep(220); setText(scenario, "converter_amount_length", "100"); capture(scenario, "12_unit_converter")
            showScreen(scenario, "library"); capture(scenario, "13_library_all")
            scenario.onActivity { S.dispatchSegment(S.findByTag(it.window.decorView, "library_subject_lens")!!, 1, 10) }; Thread.sleep(180); capture(scenario, "14_library_subject_selected")
            scenario.onActivity { (S.findByTag(it.window.decorView, "library_mega_search") as NoImeEditText).requestFocus() }; Thread.sleep(120); capture(scenario, "15_library_search_active")
            setText(scenario, "library_mega_search", "biyt"); scenario.onActivity { S.clickableAncestor(S.findByText(it.window.decorView, "Search"))?.performClick() }; Thread.sleep(180); capture(scenario, "16_library_biyt_vieta")
            setText(scenario, "library_mega_search", "zzzz-no-match"); scenario.onActivity { S.clickableAncestor(S.findByText(it.window.decorView, "Search"))?.performClick() }; Thread.sleep(160); capture(scenario, "17_library_no_result")
        }
    }

    @Test fun bVisualToolMatrix() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            openTool(scenario, "quadratic-solver"); capture(scenario, "18_quadratic_empty")
            setText(scenario, "field_a", "1"); setText(scenario, "field_b", "-3"); setText(scenario, "field_c", "2"); setText(scenario, "field_d", "0"); capture(scenario, "19_quadratic_filled")
            clickTag(scenario, "tool_calculate_quadratic-solver"); capture(scenario, "20_quadratic_result")
            openTool(scenario, "vieta"); capture(scenario, "21_vieta")
            openTool(scenario, "discriminant"); capture(scenario, "22_discriminant")
            openTool(scenario, "cubic-solver"); capture(scenario, "23_higher_degree_polynomial")
            openTool(scenario, "ohms-law"); capture(scenario, "24_physics_ohms_law")
            openTool(scenario, "triangle-solver"); capture(scenario, "25_geometry_triangle")
            openTool(scenario, "statistics-dataset"); capture(scenario, "26_statistics_dataset")
            openTool(scenario, "compound-interest"); capture(scenario, "27_finance_compound_interest")
            showScreen(scenario, "graph"); setText(scenario, "graph_expression", "x^2"); scenario.onActivity { S.findByText(it.window.decorView, "Plot")?.performClick() }; Thread.sleep(700); capture(scenario, "28_graph_parabola")
            setText(scenario, "graph_expression", "1/x"); scenario.onActivity { S.findByText(it.window.decorView, "Plot")?.performClick() }; Thread.sleep(700); capture(scenario, "29_graph_hyperbola")
            setText(scenario, "graph_expression", "x^2; sin(x)"); scenario.onActivity { S.findByText(it.window.decorView, "Plot")?.performClick() }; Thread.sleep(700); capture(scenario, "30_graph_analysis_multiple")
        }
    }

    @Test fun cVisualSystemMatrix() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            setText(scenario, "standard-input", "8*9"); clickTag(scenario, "calculate"); showScreen(scenario, "history"); capture(scenario, "31_history")
            showScreen(scenario, "widgets"); capture(scenario, "32_widgets_gallery")
            captureWidget(scenario, "standard-calculator", "33_widget_standard")
            captureWidget(scenario, "currency", "34_widget_currency")
            captureWidget(scenario, "ohms-law", "35_widget_formula")
            captureWidget(scenario, "graph-functions", "36_widget_graph")
            openTool(scenario, "text-analyzer"); capture(scenario, "37_text_analyzer")
            showScreen(scenario, "settings"); capture(scenario, "38_settings")
        }
        S.targetContext.getSharedPreferences("calculator_settings", 0).edit().putBoolean("reduced_transparency", true).commit()
        ActivityScenario.launch(MainActivity::class.java).use { scenario -> capture(scenario, "39_reduced_transparency") }
        S.targetContext.getSharedPreferences("calculator_settings", 0).edit().putBoolean("reduced_transparency", false).commit()
        shell("wm size 720x1440"); shell("wm density 320"); Thread.sleep(350)
        try {
            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                capture(scenario, "40_narrow_standard")
                scenario.onActivity { S.dispatchSegment(S.findByTag(it.window.decorView, "calculator_mode_segmented")!!, 1, 3) }; Thread.sleep(180); capture(scenario, "41_narrow_scientific")
                scenario.onActivity { S.invoke(it, "showConverterEnvironment", "length") }; Thread.sleep(180); capture(scenario, "42_narrow_converter")
                openTool(scenario, "quadratic-solver"); capture(scenario, "43_narrow_purpose_built_tool")
                showScreen(scenario, "graph"); Thread.sleep(500); capture(scenario, "44_multiwindow_resize_state")
                openTool(scenario, "quadratic-solver"); setText(scenario, "field_a", "0"); setText(scenario, "field_b", "2"); setText(scenario, "field_c", "1"); setText(scenario, "field_d", "0"); clickTag(scenario, "tool_calculate_quadratic-solver"); capture(scenario, "45_error_invalid_state")
                showScreen(scenario, "history"); setText(scenario, "history_search", "zzzz-no-history"); scenario.onActivity { S.clickableAncestor(S.findByText(it.window.decorView, "Search"))?.performClick() }; Thread.sleep(160); capture(scenario, "46_empty_history_or_state")
            }
        } finally { shell("wm size reset"); shell("wm density reset"); Thread.sleep(250) }
    }

    @Test fun dLiquidGlassCloseupSourceFrames() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            capture(scenario, "47_glass_top_clear_control"); capture(scenario, "48_glass_tinted_equals_action")
            showScreen(scenario, "library"); capture(scenario, "49_glass_selected_segmented_lens")
            scenario.onActivity { (S.findByTag(it.window.decorView, "library_mega_search") as NoImeEditText).requestFocus() }; capture(scenario, "50_glass_library_search")
            showScreen(scenario, "standard"); clickDescription(scenario, "Main Brain"); capture(scenario, "51_glass_expanded_control_space")
            showScreen(scenario, "converters"); scenario.onActivity { S.invoke(it, "showCurrencyEnvironment") }; Thread.sleep(220); capture(scenario, "52_glass_swap_control")
            showScreen(scenario, "settings"); capture(scenario, "53_glass_slider")
            showScreen(scenario, "standard"); clickDescription(scenario, "Main Brain"); capture(scenario, "54_glass_main_brain_control")
        }
        S.targetContext.getSharedPreferences("calculator_settings", 0).edit().putBoolean("reduced_transparency", true).commit()
        ActivityScenario.launch(MainActivity::class.java).use { scenario -> capture(scenario, "55_glass_reduced_transparency_comparison") }
        S.targetContext.getSharedPreferences("calculator_settings", 0).edit().putBoolean("reduced_transparency", false).commit()
    }

    private fun captureWidget(scenario: ActivityScenario<MainActivity>, toolId: String, name: String) {
        var host: AppWidgetHost? = null; var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID; var overlay: FrameLayout? = null; var available = false
        scenario.onActivity { activity ->
            val manager = AppWidgetManager.getInstance(activity)
            val h = AppWidgetHost(activity, 9102).also { host = it; it.startListening() }
            widgetId = h.allocateAppWidgetId(); val provider = ComponentName(activity, VeltrixToolWidgetProvider::class.java)
            available = manager.bindAppWidgetIdIfAllowed(widgetId, provider)
            if (available) {
                WidgetConfigStore(activity).save(WidgetConfig(widgetId, toolId)); VeltrixToolWidgetProvider().onUpdate(activity, manager, intArrayOf(widgetId))
                val info = manager.getAppWidgetInfo(widgetId); val hostView = h.createView(activity, widgetId, info)
                overlay = FrameLayout(activity).apply { setBackgroundColor(Color.rgb(249,249,246)); addView(hostView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 560, Gravity.CENTER)) }
                activity.addContentView(overlay, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            }
        }
        Thread.sleep(180)
        if (available) S.screenshot(name) else S.writeText("visual/${name}_UNAVAILABLE.txt", "AppWidget bind permission unavailable in emulator CI; runtime widget contracts are tested separately.")
        scenario.onActivity { overlay?.let { o -> (o.parent as? ViewGroup)?.removeView(o) }; if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) host?.deleteAppWidgetId(widgetId); host?.stopListening() }
    }
    private fun shell(command: String) { S.shell(command) }
}
