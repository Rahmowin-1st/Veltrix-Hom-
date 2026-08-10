package com.veltrix.calculator.app

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.*
import android.view.inputmethod.EditorInfo
import android.widget.*
import com.veltrix.calculator.core.*
import java.text.DateFormat
import java.util.*
import kotlin.concurrent.thread
import kotlin.math.max

class MainActivity : Activity() {
    private val engine = VeltrixCalculatorEngine()
    private lateinit var db: HistoryDb
    private lateinit var currency: CurrencyRepository
    private lateinit var input: EditText
    private lateinit var result: TextView
    private lateinit var detail: TextView
    private lateinit var status: TextView
    private var settings = EngineSettings()
    private var uiPrefs = UiPrefs()
    private var currentTab = 0
    private var lastResult: CalculationResult? = null
    private var resultPulse: ResultPulseView? = null

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        db = HistoryDb(this)
        currency = CurrencyRepository(this)
        loadSettings()
        configureWindow()
        showCalculator()
    }

    private fun loadSettings() {
        val prefs = getSharedPreferences("calculator_settings", MODE_PRIVATE)
        val mode = if (prefs.getString("angle", "DEGREES") == "RADIANS") AngleMode.RADIANS else AngleMode.DEGREES
        settings = EngineSettings(mode, prefs.getInt("precision", 18).coerceIn(6, 50))
        uiPrefs = UiPrefs(
            reduceTransparency = prefs.getBoolean("reduce_transparency", false),
            reduceMotion = prefs.getBoolean("reduce_motion", false)
        )
    }

    private fun configureWindow() {
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = VxColor.BACKGROUND
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
    }

    private fun rootColumn(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(18), dp(30), dp(18), dp(112))
    }

    private fun title(text: String, size: Float = 29f): TextView = TextView(this).apply {
        this.text = text
        textSize = size
        setTextColor(VxColor.TEXT)
        setTypeface(typeface, Typeface.BOLD)
        includeFontPadding = false
        setPadding(0, dp(8), 0, dp(5))
    }

    private fun subtitle(text: String): TextView = TextView(this).apply {
        this.text = text
        textSize = 13.5f
        setTextColor(VxColor.TEXT_MUTED)
        includeFontPadding = false
    }

    private fun section(text: String): TextView = TextView(this).apply {
        this.text = text.uppercase(Locale.getDefault())
        textSize = 11.5f
        letterSpacing = .08f
        setTextColor(VxColor.TEXT_MUTED)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(dp(4), dp(24), 0, dp(9))
    }

    private fun glassButton(
        text: String,
        tagValue: String? = null,
        tint: Int = VxColor.BLUE,
        emphasis: Float = .24f,
        quiet: Boolean = false,
        action: () -> Unit
    ): LiquidGlassButton = LiquidGlassButton(this).apply {
        this.text = text
        tag = tagValue
        contentDescription = tagValue ?: text
        configure(uiPrefs, tint = tint, emphasis = emphasis, quiet = quiet)
        setOnClickListener { action() }
    }

    private fun contentCard(radius: Float = 24f, strong: Boolean = false): LinearLayout {
        val d = LiquidGlassDrawable(
            dp(radius).toFloat(),
            GlassSpec(
                variant = GlassVariant.REGULAR,
                tint = VxColor.BLUE,
                emphasis = if (strong) .23f else .11f,
                quiet = !strong,
                reduceTransparency = uiPrefs.reduceTransparency,
                highContrast = VeltrixAccess.highContrast(this)
            )
        )
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(17), dp(15), dp(17), dp(15))
            background = d
            elevation = dp(if (strong) 5 else 2).toFloat()
        }
    }

    private fun setScreen(content: View, selectedTab: Int) {
        currentTab = selectedTab
        val root = FrameLayout(this)
        root.addView(VeltrixBackgroundView(this), FrameLayout.LayoutParams(-1, -1))
        root.addView(content, FrameLayout.LayoutParams(-1, -1))
        val nav = GlassNavigationBar(
            this,
            uiPrefs,
            listOf(
                GlassNavigationBar.NavItem("Calc", "nav-calc"),
                GlassNavigationBar.NavItem("Tools", "nav-tools"),
                GlassNavigationBar.NavItem("Graph", "nav-graph"),
                GlassNavigationBar.NavItem("History", "nav-history"),
                GlassNavigationBar.NavItem("Settings", "nav-settings")
            ),
            selectedTab
        ) { index ->
            when (index) {
                0 -> if (currentTab != 0) showCalculator()
                1 -> if (currentTab != 1) showTools()
                2 -> if (currentTab != 2) showGraph()
                3 -> if (currentTab != 3) showHistory()
                4 -> if (currentTab != 4) showSettings()
            }
        }
        val navParams = FrameLayout.LayoutParams(-1, dp(60), Gravity.BOTTOM).apply {
            marginStart = dp(14); marginEnd = dp(14); bottomMargin = dp(14)
        }
        root.addView(nav, navParams)
        setContentView(root)
    }

    private fun scroll(column: View): ScrollView = ScrollView(this).apply {
        isFillViewport = true
        overScrollMode = View.OVER_SCROLL_NEVER
        addView(column)
    }

    private lateinit var scientificHolder: LinearLayout
    private data class Key(val label: String, val tint: Int = VxColor.BLUE, val emphasis: Float = .12f, val action: () -> Unit)

    private fun showCalculator(prefill: String? = null, autoCalculate: Boolean = false) {
        val c = rootColumn()
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val headText = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(title("Veltrix"))
            addView(subtitle("Calculator • smart math workspace"))
        }
        header.addView(headText, LinearLayout.LayoutParams(0, -2, 1f))
        val modeChip = glassButton(
            if (settings.angleMode == AngleMode.DEGREES) "DEG" else "RAD",
            tint = VxColor.CYAN,
            emphasis = .22f,
            quiet = true
        ) { showSettings() }.apply { textSize = 12f; minWidth = dp(60); minHeight = dp(42) }
        header.addView(modeChip)
        c.addView(header)

        status = TextView(this).apply {
            tag = "status"
            contentDescription = "status"
            text = "Offline core ready • ${settings.precision}-digit precision"
            setTextColor(VxColor.SUCCESS)
            textSize = 12.5f
            setPadding(dp(4), dp(12), 0, dp(9))
        }
        c.addView(status)

        input = GlassEditText(this).apply {
            configure(uiPrefs)
            tag = "smart-input"
            contentDescription = "smart-input"
            hint = "Try 25% of 480, 2x+7=19, or 100 km to miles"
            minLines = 2
            maxLines = 5
            gravity = Gravity.TOP or Gravity.START
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            imeOptions = EditorInfo.IME_ACTION_DONE
            setSingleLine(false)
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_DONE) { calculate(); true } else false
            }
        }
        c.addView(input, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })

        val quickRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        quickRow.addView(glassButton("Smart examples", tint = VxColor.VIOLET, emphasis = .18f, quiet = true) {
            showTools()
        }, LinearLayout.LayoutParams(0, dp(48), 1f).apply { marginEnd = dp(6) })
        quickRow.addView(glassButton("Graph it", tint = VxColor.CYAN, emphasis = .18f, quiet = true) {
            val q = input.text.toString().trim()
            showGraph(q.takeIf { it.isNotBlank() })
        }, LinearLayout.LayoutParams(0, dp(48), 1f).apply { marginStart = dp(6) })
        c.addView(quickRow, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })

        val resultFrame = FrameLayout(this)
        resultPulse = ResultPulseView(this)
        resultFrame.addView(resultPulse, FrameLayout.LayoutParams(-1, -1))
        val resultCard = contentCard(strong = true)
        val resultHeader = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val resultLabel = TextView(this).apply {
            text = "RESULT"
            textSize = 11f
            letterSpacing = .1f
            setTextColor(VxColor.TEXT_MUTED)
            setTypeface(typeface, Typeface.BOLD)
        }
        resultHeader.addView(resultLabel, LinearLayout.LayoutParams(0, -2, 1f))
        val chevron = MorphChevronView(this, uiPrefs)
        resultHeader.addView(chevron, LinearLayout.LayoutParams(dp(42), dp(42)))
        resultCard.addView(resultHeader)
        result = TextView(this).apply {
            tag = "result"
            contentDescription = "result"
            text = "0"
            textSize = 37f
            setTextColor(VxColor.TEXT)
            setTypeface(typeface, Typeface.BOLD)
            setTextIsSelectable(true)
            includeFontPadding = false
            maxLines = 5
            setPadding(0, dp(2), 0, dp(4))
        }
        resultCard.addView(result)
        detail = TextView(this).apply {
            tag = "detail"
            contentDescription = "detail"
            textSize = 13.5f
            setTextColor(VxColor.TEXT_MUTED)
            setTextIsSelectable(true)
            visibility = View.GONE
            setLineSpacing(0f, 1.12f)
        }
        resultCard.addView(detail)
        chevron.setOnClickListener {
            val open = detail.visibility != View.VISIBLE
            chevron.setOpen(open)
            if (open) {
                detail.visibility = View.VISIBLE
                if (VeltrixAccess.motionEnabled(this, uiPrefs)) {
                    detail.alpha = 0f; detail.translationY = -dp(7).toFloat()
                    detail.animate().alpha(1f).translationY(0f).setDuration(220).start()
                }
            } else detail.visibility = View.GONE
        }
        resultFrame.addView(resultCard, FrameLayout.LayoutParams(-1, -2))
        c.addView(resultFrame, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(13) })

        val mode = LiquidSegmentedControl(this, listOf("Basic", "Scientific"), 0, uiPrefs) { index ->
            scientificHolder.visibility = if (index == 1) View.VISIBLE else View.GONE
            if (index == 1 && VeltrixAccess.motionEnabled(this, uiPrefs)) {
                scientificHolder.alpha = 0f; scientificHolder.scaleY = .82f
                scientificHolder.animate().alpha(1f).scaleY(1f).setDuration(230).start()
            }
        }
        c.addView(mode, LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(14) })

        scientificHolder = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            visibility = View.GONE
        }
        val sciScroll = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            addView(scientificHolder)
        }
        val sci = listOf("sin(" to "sin(", "cos(" to "cos(", "tan(" to "tan(", "√" to "sqrt(", "ln" to "ln(", "log" to "log(", "x!" to "!", "π" to "pi", "e" to "e", "xʸ" to "^")
        sci.forEach { (label, token) ->
            scientificHolder.addView(glassButton(label, tint = VxColor.VIOLET, emphasis = .15f, quiet = true) {
                appendToken(token)
            }, LinearLayout.LayoutParams(dp(66), dp(48)).apply { marginEnd = dp(7) })
        }
        c.addView(sciScroll, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(9) })

        val grid = GridLayout(this).apply {
            columnCount = 4
            rowCount = 5
            alignmentMode = GridLayout.ALIGN_BOUNDS
            useDefaultMargins = false
        }
        val keys = listOf(
            Key("AC", VxColor.ERROR, .18f) { clearAll() },
            Key("()", VxColor.VIOLET, .16f) { smartParen() },
            Key("%", VxColor.VIOLET, .18f) { appendToken("%") },
            Key("÷", VxColor.CYAN, .34f) { appendToken("÷") },
            Key("7") { appendToken("7") }, Key("8") { appendToken("8") }, Key("9") { appendToken("9") }, Key("×", VxColor.CYAN, .34f) { appendToken("×") },
            Key("4") { appendToken("4") }, Key("5") { appendToken("5") }, Key("6") { appendToken("6") }, Key("−", VxColor.CYAN, .34f) { appendToken("−") },
            Key("1") { appendToken("1") }, Key("2") { appendToken("2") }, Key("3") { appendToken("3") }, Key("+", VxColor.CYAN, .34f) { appendToken("+") },
            Key("0") { appendToken("0") }, Key(".") { appendToken(".") }, Key("⌫", VxColor.WARNING, .16f) { backspace() }, Key("=", VxColor.CYAN, .68f) { calculate() }
        )
        keys.forEachIndexed { index, key ->
            val b = glassButton(key.label, if (key.label == "=") "calculate" else null, key.tint, key.emphasis, key.emphasis < .2f) { key.action() }
            if (key.label == "=") { b.textSize = 22f; b.setTypeface(b.typeface, Typeface.BOLD) }
            if (key.label.length == 1 && key.label[0].isDigit()) b.textSize = 22f
            val col = index % 4
            val row = index / 4
            grid.addView(b, GridLayout.LayoutParams(GridLayout.spec(row, 1f), GridLayout.spec(col, 1f)).apply {
                width = 0; height = dp(59); setMargins(dp(4), dp(4), dp(4), dp(4))
            })
        }
        c.addView(grid, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })

        setScreen(scroll(c), 0)
        if (prefill != null) input.setText(prefill)
        if (autoCalculate && !prefill.isNullOrBlank()) calculate()
    }

    private fun appendToken(token: String) {
        val start = max(0, input.selectionStart)
        val end = max(0, input.selectionEnd)
        input.text.replace(minOf(start, end), maxOf(start, end), token)
        input.requestFocus()
    }

    private fun smartParen() {
        val s = input.text.toString()
        val opens = s.count { it == '(' }
        val closes = s.count { it == ')' }
        appendToken(if (opens > closes) ")" else "(")
    }

    private fun backspace() {
        val s = input.selectionStart
        val e = input.selectionEnd
        if (s != e && s >= 0 && e >= 0) input.text.delete(minOf(s, e), maxOf(s, e))
        else if (s > 0) input.text.delete(s - 1, s)
    }

    private fun clearAll() {
        input.setText("")
        result.text = "0"
        detail.text = ""
        detail.visibility = View.GONE
        lastResult = null
    }

    private fun calculate() {
        val q = input.text.toString().trim()
        if (q.isBlank()) return
        result.text = "…"
        detail.text = ""
        status.text = "Calculating…"
        status.setTextColor(VxColor.TEXT_MUTED)
        thread {
            var out = engine.calculate(q, settings)
            if (out.requiresNetwork) {
                val amount = out.metadata["amount"]?.toDoubleOrNull()
                val base = out.metadata["base"]
                val quote = out.metadata["quote"]
                out = if (amount != null && base != null && quote != null) currency.convert(amount, base, quote, settings.precision)
                else CalculationResult.fail(q, CalculationType.CURRENCY, "NETWORK", "Currency request metadata is incomplete")
            }
            val final = out
            if (final.isSuccess) db.add(q, final.primary, final.type.name)
            runOnUiThread {
                lastResult = final
                result.text = if (final.isSuccess) final.primary else "Error"
                detail.text = renderDetails(final)
                status.text = when {
                    !final.isSuccess && final.error?.code == "NETWORK" -> "Offline core ready • live rate unavailable"
                    final.metadata["stale"] == "true" -> "Cached live data • offline fallback"
                    final.isSuccess -> "${friendlyType(final.type)} • ready"
                    else -> "Check input • core remains ready"
                }
                status.setTextColor(if (final.isSuccess) VxColor.SUCCESS else if (final.error?.code == "NETWORK") VxColor.WARNING else VxColor.ERROR)
                animateResult(final.isSuccess)
            }
        }
    }

    private fun animateResult(success: Boolean) {
        if (!VeltrixAccess.motionEnabled(this, uiPrefs)) return
        result.alpha = .42f
        result.translationY = dp(8).toFloat()
        result.scaleX = .985f; result.scaleY = .985f
        result.animate().alpha(1f).translationY(0f).scaleX(1f).scaleY(1f).setDuration(300).setInterpolator(SpringyInterpolator(.52f)).start()
        val pulse = resultPulse ?: return
        ValueAnimator.ofFloat(0f, if (success) 1f else .65f, 0f).apply {
            duration = 520
            addUpdateListener { pulse.intensity = it.animatedValue as Float }
            start()
        }
    }

    private fun renderDetails(r: CalculationResult): String = if (!r.isSuccess) {
        "${r.error?.code}: ${r.error?.message}"
    } else buildString {
        append(friendlyType(r.type))
        r.exact?.takeIf { it != r.primary }?.let { append("\nExact  $it") }
        r.approximate?.takeIf { it != r.primary && it != r.exact }?.let { append("\nApprox  $it") }
        if (r.alternatives.isNotEmpty()) append("\n" + r.alternatives.entries.joinToString("   ") { "${prettyKey(it.key)} ${it.value}" })
        if (r.derived.isNotEmpty()) append("\n" + r.derived.entries.joinToString("\n") { "${prettyKey(it.key)}  ${it.value}" })
        if (r.metadata["stale"] == "true") append("\nCached/stale live data")
        if (r.steps.isNotEmpty()) append("\n\n" + r.steps.joinToString("  →  "))
    }

    private fun prettyKey(s: String) = s.replace('_', ' ').replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }
    private fun friendlyType(t: CalculationType) = when (t) {
        CalculationType.DATE_TIME -> "Date & time"
        else -> t.name.lowercase().replace('_', ' ').replaceFirstChar { it.titlecase(Locale.getDefault()) }
    }

    private data class ToolItem(val title: String, val subtitle: String, val example: String, val accent: Int = VxColor.BLUE, val graph: Boolean = false)

    private fun showTools() {
        val c = rootColumn()
        c.addView(title("Tools & examples"))
        c.addView(subtitle("Power when you need it. Tap a tool to load a working command into Smart Calculate."))

        val groups = linkedMapOf(
            "Algebra & symbolic" to listOf(
                ToolItem("Equation", "One-variable equation solver", "2x+7=19", VxColor.CYAN),
                ToolItem("Linear system", "Multi-variable linear systems", "x+y+z=6; 2x-y+z=3; x+2y-z=3", VxColor.CYAN),
                ToolItem("Polynomial roots", "Real and complex polynomial roots", "roots x^3-6x^2+11x-6", VxColor.VIOLET),
                ToolItem("Complex math", "Arithmetic, roots, conjugate, phase", "complex (2+3i)*(4-5i)", VxColor.VIOLET),
                ToolItem("Symbolic derivative", "Supported deterministic symbolic subset", "differentiate x^3+sin(x)", VxColor.BLUE),
                ToolItem("Symbolic integral", "Polynomial-focused antiderivative", "integrate 3x^2+2x+1", VxColor.BLUE)
            ),
            "Linear algebra" to listOf(
                ToolItem("Matrix operations", "Add, subtract, multiply and scalar ops", "matrix [1,2;3,4] * [2,0;1,2]", VxColor.CYAN),
                ToolItem("Determinant", "Square-matrix determinant", "det [1,2;3,4]", VxColor.BLUE),
                ToolItem("Inverse / rank", "Inverse, transpose and rank", "inverse [4,7;2,6]", VxColor.VIOLET),
                ToolItem("Solve Ax=b", "Solve a matrix linear system", "solve matrix [2,1;1,-1] = [5,1]", VxColor.CYAN),
                ToolItem("Vectors", "Dot, 3D cross and magnitude", "cross [1,0,0] [0,1,0]", VxColor.SUCCESS)
            ),
            "Calculus & graph" to listOf(
                ToolItem("Numerical derivative", "Five-point derivative at x", "derivative x^2 at 3", VxColor.CYAN),
                ToolItem("Definite integral", "Simpson numerical integration", "integral x^2 from 0 to 3", VxColor.VIOLET),
                ToolItem("Limit", "Finite two-sided numerical limit", "limit sin(x)/x as x -> 0", VxColor.BLUE),
                ToolItem("Summation / product", "Discrete integer-range math", "sum x x=1..10", VxColor.SUCCESS),
                ToolItem("Graph studio", "Multi-series sampled analysis", "x^2-4; x", VxColor.CYAN, graph = true)
            ),
            "Converters & engineering" to listOf(
                ToolItem("Unit converter", "Length, area, volume, mass, temperature, speed and more", "100 km to miles", VxColor.CYAN),
                ToolItem("Engineering units", "Force, torque, density, acceleration and electrical units", "10 lb ft to n m", VxColor.VIOLET),
                ToolItem("Fuel economy", "mpg, km/L and L/100km", "30 mpg to l/100km", VxColor.SUCCESS),
                ToolItem("Currency", "Live rate with cached offline fallback", "100 USD to EUR", VxColor.WARNING),
                ToolItem("Date tools", "Difference, age and date arithmetic", "days between 2026-01-01 and 2026-01-31", VxColor.BLUE)
            ),
            "Data, finance & utility" to listOf(
                ToolItem("Statistics", "Mean, median, mode, range, variance, std-dev, percentile", "standard deviation: 2,4,4,4,5,5,7,9", VxColor.CYAN),
                ToolItem("Finance", "Interest, loan, discount, tax, markup, margin and tip", "compound interest on 1000 at 5% for 10 years monthly", VxColor.SUCCESS),
                ToolItem("Geometry", "Circle, rectangle and sphere metrics", "circle 5", VxColor.VIOLET),
                ToolItem("Programmer", "Base conversion and bitwise operations", "0xFF & 0x0F", VxColor.BLUE),
                ToolItem("Scientific", "Trig, inverse trig, hyperbolic, logs, roots and constants", "sin(45)+sqrt(16)", VxColor.CYAN)
            )
        )

        groups.forEach { (name, items) ->
            c.addView(section(name))
            items.forEach { item -> c.addView(toolCard(item), LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(9) }) }
        }
        setScreen(scroll(c), 1)
    }

    private fun toolCard(item: ToolItem): View {
        val card = contentCard(radius = 22f)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val copy = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        copy.addView(TextView(this).apply {
            text = item.title; textSize = 17f; setTextColor(VxColor.TEXT); setTypeface(typeface, Typeface.BOLD)
        })
        copy.addView(TextView(this).apply {
            text = item.subtitle; textSize = 12.5f; setTextColor(VxColor.TEXT_MUTED); setPadding(0, dp(3), 0, dp(7))
        })
        copy.addView(TextView(this).apply {
            text = item.example; textSize = 12.5f; setTextColor(item.accent); typeface = Typeface.MONOSPACE
        })
        row.addView(copy, LinearLayout.LayoutParams(0, -2, 1f))
        val go = glassButton("Open", tint = item.accent, emphasis = .32f) {
            if (item.graph) showGraph(item.example) else showCalculator(item.example, false)
        }.apply { minWidth = dp(66) }
        row.addView(go, LinearLayout.LayoutParams(dp(74), dp(48)).apply { marginStart = dp(10) })
        card.addView(row)
        card.setOnClickListener { if (item.graph) showGraph(item.example) else showCalculator(item.example, false) }
        return card
    }

    private fun showGraph(prefillExpression: String? = null) {
        val c = rootColumn()
        c.addView(title("Graph Studio"))
        c.addView(subtitle("Visualize core-computed samples. Pinch to zoom, drag to pan, tap for a crosshair."))

        val fields = contentCard(radius = 24f, strong = true)
        val expr = GlassEditText(this).apply {
            configure(uiPrefs)
            hint = "Expressions separated by ;   e.g. x^2-4; x"
            setText(prefillExpression?.removePrefix("graph ")?.substringBefore(" from ") ?: "x^2-4; x")
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            textSize = 16f
        }
        fields.addView(expr)
        val domain = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val from = GlassEditText(this).apply { configure(uiPrefs, true); hint = "from"; setText("-5"); inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED; textSize = 15f }
        val to = GlassEditText(this).apply { configure(uiPrefs, true); hint = "to"; setText("5"); inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED; textSize = 15f }
        domain.addView(from, LinearLayout.LayoutParams(0, dp(54), 1f).apply { marginEnd = dp(6) })
        domain.addView(to, LinearLayout.LayoutParams(0, dp(54), 1f).apply { marginStart = dp(6) })
        fields.addView(domain, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(9) })
        val plot = GraphPlotView(this)
        val graphFrame = FrameLayout(this).apply {
            background = LiquidGlassDrawable(dp(26).toFloat(), GlassSpec(variant = GlassVariant.CLEAR, tint = VxColor.CYAN, emphasis = .16f, reduceTransparency = uiPrefs.reduceTransparency, highContrast = VeltrixAccess.highContrast(this@MainActivity)))
            elevation = dp(3).toFloat()
            setPadding(dp(8), dp(8), dp(8), dp(8))
            addView(plot, FrameLayout.LayoutParams(-1, dp(330)))
        }
        val graphInfo = TextView(this).apply { textSize = 13f; setTextColor(VxColor.TEXT_MUTED); setPadding(dp(4), dp(10), dp(4), 0) }
        val analyze = glassButton("Analyze graph", tint = VxColor.CYAN, emphasis = .62f) {
            val a = from.text.toString().toDoubleOrNull()
            val b = to.text.toString().toDoubleOrNull()
            if (a == null || b == null || a == b) {
                graphInfo.text = "Enter a valid non-zero domain."
                graphInfo.setTextColor(VxColor.ERROR)
                return@glassButton
            }
            val command = "graph ${expr.text.toString().trim()} from $a to $b"
            graphInfo.text = "Sampling…"
            thread {
                val r = engine.calculate(command, settings)
                runOnUiThread {
                    if (!r.isSuccess) {
                        graphInfo.text = "${r.error?.code}: ${r.error?.message}"
                        graphInfo.setTextColor(VxColor.ERROR)
                    } else {
                        val count = r.metadata["series_count"]?.toIntOrNull() ?: 0
                        val parsed = (1..count).mapNotNull { i ->
                            val raw = r.metadata["series_${i}_points"] ?: return@mapNotNull null
                            val pts = raw.split(';').mapNotNull { token ->
                                val p = token.split(',')
                                if (p.size != 2) null else {
                                    val x = p[0].toDoubleOrNull(); val y = p[1].toDoubleOrNull()
                                    if (x == null || y == null) null else PlotPoint(x, y)
                                }
                            }
                            PlotSeries("f$i", pts)
                        }
                        plot.setSeries(parsed)
                        graphInfo.setTextColor(VxColor.TEXT_MUTED)
                        graphInfo.text = buildString {
                            append("${r.primary}\n")
                            r.derived["roots"]?.let { append("Roots  $it\n") }
                            r.derived["intersections"]?.let { append("Intersections  $it\n") }
                            r.derived["extrema"]?.let { append("Extrema  $it") }
                        }.trim()
                    }
                }
            }
        }
        fields.addView(analyze, LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(10) })
        c.addView(fields, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(14) })
        c.addView(graphFrame, LinearLayout.LayoutParams(-1, dp(346)).apply { topMargin = dp(13) })
        c.addView(graphInfo)
        setScreen(scroll(c), 2)
        analyze.performClick()
    }

    private fun showHistory() {
        val c = rootColumn()
        c.addView(title("History"))
        c.addView(subtitle("Search, favorite, reuse or remove calculations. Persistence remains the backend SQLite contract."))
        val search = GlassEditText(this).apply {
            configure(uiPrefs)
            hint = "Search expression, result or type"
            inputType = InputType.TYPE_CLASS_TEXT
            textSize = 16f
        }
        c.addView(search, LinearLayout.LayoutParams(-1, dp(58)).apply { topMargin = dp(14) })
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        var favoritesOnly = false
        val filter = LiquidSegmentedControl(this, listOf("All", "Favorites"), 0, uiPrefs) { index ->
            favoritesOnly = index == 1
            reloadHistory(list, search.text.toString(), favoritesOnly)
        }
        c.addView(filter, LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(10) })
        c.addView(list, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { reloadHistory(list, s?.toString().orEmpty(), favoritesOnly) }
            override fun afterTextChanged(s: Editable?) = Unit
        })
        reloadHistory(list, "", false)
        setScreen(scroll(c), 3)
    }

    private fun reloadHistory(list: LinearLayout, query: String, favoritesOnly: Boolean) {
        list.removeAllViews()
        val data = db.list(query, favoritesOnly)
        if (data.isEmpty()) {
            list.addView(contentCard().apply {
                addView(TextView(this@MainActivity).apply {
                    text = if (favoritesOnly) "No favorite calculations yet." else "No calculations found."
                    textSize = 15f; setTextColor(VxColor.TEXT_MUTED); gravity = Gravity.CENTER; setPadding(0, dp(18), 0, dp(18))
                })
            })
            return
        }
        data.forEach { item ->
            val card = contentCard(radius = 22f)
            card.addView(TextView(this).apply {
                text = item.expression; textSize = 15f; setTextColor(VxColor.TEXT); setTypeface(typeface, Typeface.BOLD); typeface = Typeface.MONOSPACE
            })
            card.addView(TextView(this).apply {
                text = item.result; textSize = 22f; setTextColor(VxColor.CYAN); setTypeface(typeface, Typeface.BOLD); setPadding(0, dp(5), 0, dp(4))
            })
            card.addView(TextView(this).apply {
                text = "${prettyKey(item.type)} • ${DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(item.createdAt))}"
                textSize = 11.5f; setTextColor(VxColor.TEXT_MUTED)
            })
            val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            actions.addView(glassButton(if (item.favorite) "★" else "☆", tint = VxColor.WARNING, emphasis = if (item.favorite) .42f else .12f, quiet = !item.favorite) {
                db.favorite(item.id, !item.favorite); reloadHistory(list, query, favoritesOnly)
            }, LinearLayout.LayoutParams(dp(56), dp(46)).apply { marginEnd = dp(6) })
            actions.addView(glassButton("Reuse", tint = VxColor.CYAN, emphasis = .28f) { showCalculator(item.expression, false) }, LinearLayout.LayoutParams(0, dp(46), 1f).apply { marginEnd = dp(6) })
            actions.addView(glassButton("Delete", tint = VxColor.ERROR, emphasis = .18f, quiet = true) { db.delete(item.id); reloadHistory(list, query, favoritesOnly) }, LinearLayout.LayoutParams(0, dp(46), 1f))
            card.addView(actions, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
            list.addView(card, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(9) })
        }
    }

    private fun showSettings() {
        val c = rootColumn()
        c.addView(title("Settings"))
        c.addView(subtitle("Math behavior, material accessibility and motion preferences."))

        c.addView(section("Angle mode"))
        var angle = settings.angleMode
        val angleControl = LiquidSegmentedControl(this, listOf("Degrees", "Radians"), if (angle == AngleMode.DEGREES) 0 else 1, uiPrefs) { index ->
            angle = if (index == 0) AngleMode.DEGREES else AngleMode.RADIANS
        }
        c.addView(angleControl, LinearLayout.LayoutParams(-1, dp(54)))

        c.addView(section("Precision"))
        var precisionValue = settings.precision
        val precisionCard = contentCard(radius = 22f)
        val precisionLabel = TextView(this).apply { text = "$precisionValue digits"; textSize = 16f; setTextColor(VxColor.TEXT); setTypeface(typeface, Typeface.BOLD) }
        precisionCard.addView(precisionLabel)
        val slider = LiquidSlider(this, 6, 50, precisionValue, uiPrefs) { v -> precisionValue = v; precisionLabel.text = "$v digits" }
        precisionCard.addView(slider, LinearLayout.LayoutParams(-1, dp(70)))
        c.addView(precisionCard)

        c.addView(section("Accessibility"))
        val a11y = contentCard(radius = 22f)
        val reduceTransparency = CheckBox(this).apply {
            text = "Reduce transparency"
            isChecked = uiPrefs.reduceTransparency
            setTextColor(VxColor.TEXT)
            textSize = 15f
            buttonTintList = android.content.res.ColorStateList.valueOf(VxColor.CYAN)
        }
        val reduceMotion = CheckBox(this).apply {
            text = "Reduce motion"
            isChecked = uiPrefs.reduceMotion
            setTextColor(VxColor.TEXT)
            textSize = 15f
            buttonTintList = android.content.res.ColorStateList.valueOf(VxColor.CYAN)
        }
        a11y.addView(reduceTransparency)
        a11y.addView(TextView(this).apply { text = "Frostier material and stronger boundaries."; textSize = 12f; setTextColor(VxColor.TEXT_MUTED); setPadding(dp(32), 0, 0, dp(7)) })
        a11y.addView(reduceMotion)
        a11y.addView(TextView(this).apply { text = "Removes elastic and large movements while preserving state feedback."; textSize = 12f; setTextColor(VxColor.TEXT_MUTED); setPadding(dp(32), 0, 0, 0) })
        c.addView(a11y)

        val save = glassButton("Save settings", "save-settings", VxColor.CYAN, .66f) {
            settings = EngineSettings(angle, precisionValue)
            getSharedPreferences("calculator_settings", MODE_PRIVATE).edit()
                .putString("angle", settings.angleMode.name)
                .putInt("precision", settings.precision)
                .putBoolean("reduce_transparency", reduceTransparency.isChecked)
                .putBoolean("reduce_motion", reduceMotion.isChecked)
                .apply()
            loadSettings()
            showCalculator()
        }
        c.addView(save, LinearLayout.LayoutParams(-1, dp(56)).apply { topMargin = dp(18) })
        setScreen(scroll(c), 4)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (currentTab != 0) showCalculator() else super.onBackPressed()
    }
}
