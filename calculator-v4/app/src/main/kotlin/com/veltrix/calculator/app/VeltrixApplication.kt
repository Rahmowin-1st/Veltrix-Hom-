package com.veltrix.calculator.app

import android.app.Activity
import android.app.Application
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView

/**
 * Frontend-only runtime presentation layer.
 *
 * MainActivity and all accepted engine/storage/navigation code remain frozen.
 * This layer styles mounted Android Views once and listens only for hierarchy
 * mutations caused by destination changes. It never owns a frame clock, blur,
 * shader, calculation truth, navigation state, persistence, or tool contracts.
 */
class VeltrixApplication : Application(), Application.ActivityLifecycleCallbacks {
    override fun onCreate() {
        super.onCreate()
        registerActivityLifecycleCallbacks(this)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = LiquidGlassRuntime.attach(activity)
    override fun onActivityResumed(activity: Activity) = LiquidGlassRuntime.attach(activity)
    override fun onActivityStarted(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivityStopped(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
}

private object LiquidGlassRuntime {
    private val operatorLabels = setOf("+", "-", "*", "/", "^", "%", "!")
    private val primaryTags = setOf(
        "calculate", "tool-calculate", "converter-calculate", "currency-calculate"
    )

    fun attach(activity: Activity) {
        val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        if (content.getTag(R.id.vlx_liquid_bound) == true) return
        content.setTag(R.id.vlx_liquid_bound, true)
        bindGroup(activity, content)
        styleTree(activity, content)
    }

    private fun bindGroup(activity: Activity, group: ViewGroup) {
        if (group.getTag(R.id.vlx_liquid_bound) == true && group.id != android.R.id.content) return
        if (group.id != android.R.id.content) group.setTag(R.id.vlx_liquid_bound, true)
        group.setOnHierarchyChangeListener(object : ViewGroup.OnHierarchyChangeListener {
            override fun onChildViewAdded(parent: View?, child: View?) {
                child?.let { styleTree(activity, it) }
            }
            override fun onChildViewRemoved(parent: View?, child: View?) = Unit
        })
    }

    private fun styleTree(activity: Activity, view: View) {
        styleView(activity, view)
        if (view is ViewGroup) {
            if (view.getTag(R.id.vlx_liquid_bound) != true || view.id == android.R.id.content) bindGroup(activity, view)
            for (index in 0 until view.childCount) styleTree(activity, view.getChildAt(index))
            if (view.tag == "route-home") augmentHome(activity, view)
        }
    }

    private fun styleView(activity: Activity, view: View) {
        if (view.getTag(R.id.vlx_liquid_styled) == true) return
        view.setTag(R.id.vlx_liquid_styled, true)
        val density = activity.resources.displayMetrics.density
        fun dp(value: Int): Int = (value * density + 0.5f).toInt()

        val semanticTag = view.tag?.toString().orEmpty()
        when (view) {
            is ScrollView -> view.setBackgroundColor(Color.rgb(247, 249, 252))
            is HorizontalScrollView -> view.isHorizontalScrollBarEnabled = false
            is LinearLayout -> {
                if (semanticTag.startsWith("route-") || semanticTag == "workspace-shell") {
                    view.background = surfaceGradient()
                    if (semanticTag.startsWith("route-")) view.setPadding(dp(16), dp(12), dp(16), dp(16))
                }
                if (semanticTag == "workspace-bottom-nav") {
                    view.setBackgroundResource(R.drawable.vlx_glass_nav)
                    view.elevation = dp(10).toFloat()
                    view.setPadding(dp(8), dp(7), dp(8), dp(9))
                }
            }
            is Button -> styleButton(activity, view, semanticTag)
            is EditText -> styleField(activity, view, semanticTag)
            is Spinner -> {
                view.minimumHeight = dp(52)
                view.elevation = dp(1).toFloat()
            }
            is RadioButton -> {
                view.minimumHeight = dp(48)
                view.setTextColor(Color.rgb(16, 24, 40))
            }
            is TextView -> styleText(activity, view, semanticTag)
        }
    }

    private fun styleButton(activity: Activity, button: Button, semanticTag: String) {
        val density = activity.resources.displayMetrics.density
        fun dp(value: Int): Int = (value * density + 0.5f).toInt()
        button.isAllCaps = false
        button.minimumHeight = dp(48)
        button.minWidth = dp(48)
        button.isHapticFeedbackEnabled = true
        button.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL))

        val primary = semanticTag in primaryTags || button.text?.toString() == "Save"
        val operator = button.text?.toString() in operatorLabels
        when {
            primary -> {
                button.setBackgroundResource(R.drawable.vlx_glass_primary)
                button.setTextColor(Color.WHITE)
            }
            operator -> {
                button.setBackgroundResource(R.drawable.vlx_glass_operator)
                button.setTextColor(Color.rgb(22, 63, 145))
            }
            else -> {
                button.setBackgroundResource(R.drawable.vlx_glass_button)
                button.setTextColor(Color.rgb(16, 24, 40))
            }
        }
        if (semanticTag.startsWith("nav-")) button.textSize = 12.5f
        if (semanticTag.startsWith("tool-") && semanticTag != "tool-calculate" && semanticTag !in setOf("tool-page-next", "tool-page-prev")) {
            button.gravity = Gravity.START or Gravity.CENTER_VERTICAL
            button.minimumHeight = dp(64)
            button.textSize = 14f
        }
        bindPressMotion(button, dp(4).toFloat())
    }

    private fun bindPressMotion(view: View, restingTranslationZ: Float) {
        if (view.getTag(R.id.vlx_touch_bound) == true) return
        view.setTag(R.id.vlx_touch_bound, true)
        view.setOnTouchListener { target, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    if (target.isEnabled) target.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    target.animate().cancel()
                    target.animate().scaleX(0.965f).scaleY(0.965f).translationZ(0f).setDuration(65L).start()
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    target.animate().cancel()
                    target.animate().scaleX(1f).scaleY(1f).translationZ(restingTranslationZ).setDuration(150L).start()
                }
            }
            false
        }
    }

    private fun styleField(activity: Activity, field: EditText, semanticTag: String) {
        val density = activity.resources.displayMetrics.density
        fun dp(value: Int): Int = (value * density + 0.5f).toInt()
        field.minimumHeight = dp(52)
        field.setTextColor(Color.rgb(16, 24, 40))
        field.setHintTextColor(Color.rgb(123, 135, 154))
        field.setBackgroundResource(R.drawable.vlx_glass_field)
        field.setPadding(dp(15), dp(10), dp(15), dp(10))
        if (semanticTag == "standard-input") {
            field.showSoftInputOnFocus = false
            field.setSingleLine(true)
            field.setHorizontallyScrolling(true)
            field.isHorizontalScrollBarEnabled = false
            field.gravity = Gravity.END or Gravity.CENTER_VERTICAL
            field.textSize = 24f
            field.setOnFocusChangeListener { _, focused -> if (focused) field.setSelection(field.text?.length ?: 0) }
        }
    }

    private fun styleText(activity: Activity, text: TextView, semanticTag: String) {
        text.setTextColor(Color.rgb(16, 24, 40))
        if (text.textSize / activity.resources.displayMetrics.scaledDensity >= 23f && text.typeface?.style == Typeface.BOLD) {
            text.setTypeface(Typeface.create("sans-serif", Typeface.BOLD))
            text.letterSpacing = -0.015f
        }
        when (semanticTag) {
            "result" -> {
                text.textSize = 34f
                text.gravity = Gravity.END
                text.setTypeface(Typeface.create("sans-serif", Typeface.BOLD))
            }
            "tool-result", "converter-result", "currency-result" -> {
                text.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL))
            }
            "tool-page-label" -> text.setTextColor(Color.rgb(47, 107, 255))
        }
    }

    private fun augmentHome(activity: Activity, root: ViewGroup) {
        if (root.getTag(R.id.vlx_home_augmented) == true) return
        val linear = root as? LinearLayout ?: return
        val input = findTagged<EditText>(root, "standard-input") ?: return
        val result = findTagged<TextView>(root, "result") ?: return
        root.setTag(R.id.vlx_home_augmented, true)

        val density = activity.resources.displayMetrics.density
        fun dp(value: Int): Int = (value * density + 0.5f).toInt()
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(4), 0, dp(4))
            contentDescription = "Calculator editing controls"
        }
        val clear = Button(activity).apply {
            tag = "standard-clear"
            contentDescription = "Clear expression"
            text = if (input.text.isNullOrEmpty()) "AC" else "C"
            setOnClickListener {
                input.text?.clear()
                result.text = "0"
                text = "AC"
            }
        }
        val backspace = Button(activity).apply {
            tag = "standard-backspace"
            contentDescription = "Delete last character"
            text = "⌫"
        }
        row.addView(clear, LinearLayout.LayoutParams(0, dp(48), 1f).apply { marginEnd = dp(4) })
        row.addView(backspace, LinearLayout.LayoutParams(0, dp(48), 1f).apply { marginStart = dp(4) })

        val resultIndex = (0 until linear.childCount).firstOrNull { linear.getChildAt(it) === result } ?: -1
        linear.addView(row, (resultIndex + 1).coerceAtMost(linear.childCount))
        styleTree(activity, row)
        bindBackspace(backspace, input)
        input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                clear.text = if (s.isNullOrEmpty()) "AC" else "C"
            }
            override fun afterTextChanged(s: Editable?) = Unit
        })
    }

    private fun bindBackspace(button: Button, input: EditText) {
        val handler = Handler(Looper.getMainLooper())
        var repeating = false
        fun deleteOne() {
            val editable = input.text ?: return
            val end = input.selectionEnd.takeIf { it > 0 } ?: editable.length
            if (end > 0 && editable.isNotEmpty()) editable.delete(end - 1, end)
        }
        val repeat = object : Runnable {
            override fun run() {
                if (!repeating) return
                deleteOne()
                handler.postDelayed(this, 65L)
            }
        }
        button.setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    view.animate().cancel()
                    view.animate().scaleX(0.955f).scaleY(0.955f).translationZ(0f).setDuration(55L).start()
                    deleteOne()
                    repeating = true
                    handler.postDelayed(repeat, 360L)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    repeating = false
                    handler.removeCallbacks(repeat)
                    view.animate().cancel()
                    view.animate().scaleX(1f).scaleY(1f).translationZ((4f * view.resources.displayMetrics.density)).setDuration(145L).start()
                    true
                }
                else -> true
            }
        }
    }

    private fun surfaceGradient(): GradientDrawable = GradientDrawable(
        GradientDrawable.Orientation.TL_BR,
        intArrayOf(Color.rgb(249, 251, 255), Color.rgb(243, 247, 252), Color.rgb(248, 250, 253))
    )

    @Suppress("UNCHECKED_CAST")
    private fun <T : View> findTagged(root: View, tag: String): T? {
        if (root.tag == tag) return root as? T
        if (root is ViewGroup) {
            for (index in 0 until root.childCount) {
                val found = findTagged<T>(root.getChildAt(index), tag)
                if (found != null) return found
            }
        }
        return null
    }
}
