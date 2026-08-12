from pathlib import Path

main = Path('app/src/main/kotlin/com/veltrix/calculator/app/MainActivity.kt')
s = main.read_text()

anchor = '        displayColumn.addView(buildTopActions(), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(58f)))\n        val display = LinearLayout(this).apply {'
assert anchor in s, 'display creation anchor missing'
s = s.replace(
    anchor,
    '        displayColumn.addView(buildTopActions(), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(58f)))\n        val brainGesture = InteriorBrainGesture()\n        val display = LinearLayout(this).apply {',
    1,
)

assert 'setOnTouchListener(InteriorBrainGesture())' in s, 'display listener anchor missing'
s = s.replace('setOnTouchListener(InteriorBrainGesture())', 'setOnTouchListener(brainGesture)', 1)

anchor = 'expressionLayer.addView(standardExpressionView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END))\n\nval resultLayer'
assert anchor in s, 'expression listener anchor missing'
s = s.replace(
    anchor,
    'expressionLayer.addView(standardExpressionView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END))\nexpressionLayer.setOnTouchListener(brainGesture)\nstandardExpressionView.setOnTouchListener(brainGesture)\n\nval resultLayer',
    1,
)

anchor = 'resultLayer.addView(standardResultView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END))\ndisplay.addView(expressionLayer'
assert anchor in s, 'result listener anchor missing'
s = s.replace(
    anchor,
    'resultLayer.addView(standardResultView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END))\nresultLayer.setOnTouchListener(brainGesture)\nstandardResultView.setOnTouchListener(brainGesture)\ndisplay.addView(expressionLayer',
    1,
)

old = '''                MotionEvent.ACTION_DOWN -> {
                    if (brainOpen || event.x < dp(24f) || event.x > v.width - dp(24f)) return false
                    downX = event.x
                    downY = event.y
                    tracking = false
                    velocityTracker?.recycle()
                    velocityTracker = VelocityTracker.obtain().also { it.addMovement(event) }
                    return true
                }'''
new = '''                MotionEvent.ACTION_DOWN -> {
                    if (brainOpen) return false
                    downX = event.x
                    downY = event.y
                    tracking = false
                    velocityTracker?.recycle()
                    velocityTracker = VelocityTracker.obtain().also { it.addMovement(event) }
                    // Normal display taps/select remain untouched; horizontal drag claims ownership later.
                    return false
                }'''
assert old in s, 'gesture ACTION_DOWN block missing'
s = s.replace(old, new, 1)

assert 'val travel = (v.width * 0.78f).coerceAtLeast(dp(120f).toFloat())' in s, 'gesture travel anchor missing'
s = s.replace(
    'val travel = (v.width * 0.78f).coerceAtLeast(dp(120f).toFloat())',
    'val travel = (resources.displayMetrics.widthPixels * 0.78f).coerceAtLeast(dp(120f).toFloat())',
    1,
)

assert 'tracking = true\n                        refreshBrainAdaptive()' in s, 'gesture tracking anchor missing'
s = s.replace(
    'tracking = true\n                        refreshBrainAdaptive()',
    'tracking = true\n                        v.parent?.requestDisallowInterceptTouchEvent(true)\n                        refreshBrainAdaptive()',
    1,
)

main.write_text(s)

test = r'''package com.veltrix.calculator.app

import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.veltrix.calculator.app.frontend.NoImeEditText
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FrontendQ2QualityRuntimeTest {
    private fun findByTag(root: View, tag: String): View? {
        if (root.tag == tag) return root
        if (root is ViewGroup) for (i in 0 until root.childCount) findByTag(root.getChildAt(i), tag)?.let { return it }
        return null
    }

    private fun findByDescription(root: View, description: String): View? {
        if (root.contentDescription?.toString() == description) return root
        if (root is ViewGroup) for (i in 0 until root.childCount) findByDescription(root.getChildAt(i), description)?.let { return it }
        return null
    }

    @Test fun aStandardAndDirectBrainGesture() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            val inst = InstrumentationRegistry.getInstrumentation()
            inst.waitForIdleSync()
            Thread.sleep(120)

            var startX = 0f
            var midX = 0f
            var endX = 0f
            var y = 0f
            scenario.onActivity { activity ->
                val root = activity.window.decorView
                val display = findByTag(root, "calculator_display")!!
                val resultLayer = findByTag(root, "standard_result")!!
                val brain = findByTag(root, "main_brain")!!
                assertNotNull(findByTag(root, "standard_expression"))
                assertTrue("display must be laid out", display.width > 100 && display.height > 80)
                assertTrue("result layer must be laid out", resultLayer.width > 100 && resultLayer.height > 20)
                assertEquals(View.INVISIBLE, brain.visibility)
                val loc = IntArray(2)
                resultLayer.getLocationOnScreen(loc)
                startX = loc[0] + resultLayer.width * 0.84f
                midX = loc[0] + resultLayer.width * 0.54f
                endX = loc[0] + resultLayer.width * 0.14f
                y = loc[1] + resultLayer.height * 0.50f
            }

            val t = android.os.SystemClock.uptimeMillis()
            fun send(action: Int, x: Float, time: Long) {
                MotionEvent.obtain(t, time, action, x, y, 0).also {
                    inst.sendPointerSync(it)
                    it.recycle()
                }
            }
            send(MotionEvent.ACTION_DOWN, startX, t)
            send(MotionEvent.ACTION_MOVE, midX, t + 40)
            inst.waitForIdleSync()
            scenario.onActivity { activity ->
                val brain = findByTag(activity.window.decorView, "main_brain")!!
                assertEquals(View.VISIBLE, brain.visibility)
                assertTrue("brain must follow finger during drag", brain.translationX > 0f)
            }
            send(MotionEvent.ACTION_MOVE, endX, t + 80)
            send(MotionEvent.ACTION_UP, endX, t + 105)
            inst.waitForIdleSync()
            Thread.sleep(260)
            scenario.onActivity { activity ->
                val brain = findByTag(activity.window.decorView, "main_brain")!!
                assertEquals(View.VISIBLE, brain.visibility)
                assertTrue("completed drag must settle open", kotlin.math.abs(brain.translationX) < 3f)
            }
        }
    }

    @Test fun bLibraryUsesOneLensAndNoImeSearch() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val root = activity.window.decorView
                findByDescription(root, "Library")!!.performClick()
            }
            Thread.sleep(250)
            scenario.onActivity { activity ->
                val root = activity.window.decorView
                assertNotNull(findByTag(root, "library_subject_lens"))
                val search = findByTag(root, "library_mega_search") as NoImeEditText
                assertFalse(search.showSoftInputOnFocus)
                search.requestFocus()
                search.setText("biyt")
                assertEquals("biyt", search.text.toString())
            }
        }
    }

    @Test fun cConvertersHaveDedicatedCurrencyEntry() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val root = activity.window.decorView
                findByDescription(root, "Converters")!!.performClick()
            }
            Thread.sleep(200)
            scenario.onActivity { activity ->
                val root = activity.window.decorView
                assertNotNull(findByTag(root, "converters_screen"))
                assertNotNull(findByDescription(root, "Currency"))
            }
        }
    }
}
'''
Path('app/src/androidTest/kotlin/com/veltrix/calculator/app/FrontendQ2QualityRuntimeTest.kt').write_text(test)

print('Q2 final source transformation complete')
