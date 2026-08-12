package com.veltrix.calculator.app

import android.app.Activity
import android.app.Instrumentation
import android.graphics.Bitmap
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.FileOutputStream

internal object Q2EvidenceSupport {
    val instrumentation: Instrumentation get() = InstrumentationRegistry.getInstrumentation()
    val targetContext get() = instrumentation.targetContext

    fun findByTag(root: View, tag: String, visibleOnly: Boolean = true): View? {
        if ((!visibleOnly || root.isShown) && root.tag == tag) return root
        if (root is ViewGroup && (!visibleOnly || root.visibility == View.VISIBLE)) {
            for (i in 0 until root.childCount) findByTag(root.getChildAt(i), tag, visibleOnly)?.let { return it }
        }
        return null
    }

    fun findByDescription(root: View, description: String, visibleOnly: Boolean = true): View? {
        if ((!visibleOnly || root.isShown) && root.contentDescription?.toString() == description) return root
        if (root is ViewGroup && (!visibleOnly || root.visibility == View.VISIBLE)) {
            for (i in 0 until root.childCount) findByDescription(root.getChildAt(i), description, visibleOnly)?.let { return it }
        }
        return null
    }

    fun findByText(root: View, text: String, visibleOnly: Boolean = true): View? {
        if (root is TextView && (!visibleOnly || root.isShown) && root.text?.toString() == text) return root
        if (root is ViewGroup && (!visibleOnly || root.visibility == View.VISIBLE)) {
            for (i in 0 until root.childCount) findByText(root.getChildAt(i), text, visibleOnly)?.let { return it }
        }
        return null
    }

    fun clickableAncestor(view: View?): View? {
        var v = view
        while (v != null) {
            if (v.isClickable) return v
            v = v.parent as? View
        }
        return null
    }

    fun invoke(activity: Activity, name: String, vararg args: Any?) {
        val methods = activity.javaClass.declaredMethods.filter { it.name == name && it.parameterTypes.size == args.size }
        val method = methods.firstOrNull { m ->
            m.parameterTypes.zip(args).all { (type, arg) ->
                arg == null || type.isAssignableFrom(arg.javaClass) ||
                    (type == java.lang.Boolean.TYPE && arg is Boolean) ||
                    (type == java.lang.Integer.TYPE && arg is Int) ||
                    (type == java.lang.Float.TYPE && arg is Float)
            }
        } ?: error("Missing method $name/${args.size}")
        method.isAccessible = true
        method.invoke(activity, *args)
    }

    fun screenshot(name: String) {
        instrumentation.waitForIdleSync()
        Thread.sleep(90)
        @Suppress("DEPRECATION")
        val bitmap = instrumentation.uiAutomation.takeScreenshot() ?: error("Screenshot failed: $name")
        val root = File(targetContext.getExternalFilesDir(null), "q2evidence/visual").apply { mkdirs() }
        FileOutputStream(File(root, "$name.png")).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }

    fun writeText(relative: String, text: String) {
        val file = File(targetContext.getExternalFilesDir(null), "q2evidence/$relative")
        file.parentFile?.mkdirs()
        file.writeText(text)
    }

    fun shell(command: String): String {
        val pfd = instrumentation.uiAutomation.executeShellCommand(command)
        return android.os.ParcelFileDescriptor.AutoCloseInputStream(pfd).bufferedReader().use { it.readText() }
    }

    fun clearEvidence() {
        File(targetContext.getExternalFilesDir(null), "q2evidence").deleteRecursively()
    }

    fun pointInWindow(view: View, fx: Float = 0.5f, fy: Float = 0.5f): Pair<Float, Float> {
        val loc = IntArray(2)
        view.getLocationInWindow(loc)
        return (loc[0] + view.width * fx) to (loc[1] + view.height * fy)
    }

    fun injectTap(view: View, holdMs: Long = 90) {
        val (x, y) = pointInWindow(view)
        val down = SystemClock.uptimeMillis()
        instrumentation.uiAutomation.injectInputEvent(MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, x, y, 0), true)
        Thread.sleep(holdMs)
        instrumentation.uiAutomation.injectInputEvent(MotionEvent.obtain(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x, y, 0), true)
        instrumentation.waitForIdleSync()
    }

    fun injectDrag(view: View, startFx: Float, endFx: Float, fy: Float = 0.5f, durationMs: Long = 520, steps: Int = 12) {
        val loc = IntArray(2); view.getLocationInWindow(loc)
        val startX = loc[0] + view.width * startFx
        val endX = loc[0] + view.width * endFx
        val y = loc[1] + view.height * fy
        val down = SystemClock.uptimeMillis()
        instrumentation.uiAutomation.injectInputEvent(MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, startX, y, 0), true)
        for (i in 1..steps) {
            Thread.sleep((durationMs / (steps + 1)).coerceAtLeast(10))
            val f = i.toFloat() / steps
            val x = startX + (endX - startX) * f
            instrumentation.uiAutomation.injectInputEvent(MotionEvent.obtain(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_MOVE, x, y, 0), true)
        }
        Thread.sleep(30)
        instrumentation.uiAutomation.injectInputEvent(MotionEvent.obtain(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, endX, y, 0), true)
        instrumentation.waitForIdleSync()
    }

    fun dispatchSegment(view: View, index: Int, count: Int) {
        val x = view.width * ((index + 0.5f) / count)
        val y = view.height * 0.5f
        val t = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, x, y, 0))
        view.dispatchTouchEvent(MotionEvent.obtain(t, t + 20, MotionEvent.ACTION_UP, x, y, 0))
    }
}
