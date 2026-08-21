package com.veltrix.calculator.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.veltrix.calculator.core.*
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/** V4 functional shell. Final visual styling remains Frontend-owned. */
class MainActivity : ComponentActivity() {
    private val platform = PlatformEngine()
    private val searchEngine by lazy { MegaSearchEngine(platform.registry) }
    private lateinit var history: HistoryDb
    private lateinit var adaptive: PersonalizationStore
    private lateinit var currency: CurrencyRepository
    private lateinit var navigation: AppNavigationState
    private lateinit var backCallback: OnBackPressedCallback

    private var settings = EngineSettings()
    private var standardMode = "standard-calculator"
    private var standardDraft = ""
    private var standardResultValue = "0"
    private var libraryQuery = ""
    private var librarySubjectPosition = 0
    private var historyQuery = ""
    private var graphQuery = ""
    private var converterCategory = "Length"
    private var converterAmount = "1"
    private var converterFromId = ""
    private var converterToId = ""
    private var converterResultValue = ""
    private var currencyBase = "USD"
    private var currencyQuote = "UZS"
    private var lastCurrencyActiveNetworkAt = 0L

    private val toolDrafts = linkedMapOf<String, Map<String, String>>()
    private val toolUnknowns = linkedMapOf<String, String>()
    private val toolResults = linkedMapOf<String, String>()
    private var activeToolId: String? = null
    private var activeToolFields: Map<String, View> = emptyMap()
    private var activeUnknownSpinner: Spinner? = null
    private var activeUnknownIds: List<String> = emptyList()
    private var activeToolResult: TextView? = null
    private var standardInput: EditText? = null
    private var standardResult: TextView? = null
    private var converterAmountInput: EditText? = null
    private var converterFromSpinner: Spinner? = null
    private var converterToSpinner: Spinner? = null
    private var converterUnitIds: List<String> = emptyList()
    private var currencyAmountInput: EditText? = null
    private var currencyBaseInput: EditText? = null
    private var currencyQuoteInput: EditText? = null
    private var currencyResult: TextView? = null
    private val historyLoadGeneration = AtomicInteger()

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        history = HistoryDb(this)
        adaptive = PersonalizationStore(this)
        currency = CurrencyRepository(this)
        CurrencyRefreshScheduler.ensure(this)
        WidgetPreviewPublisher.schedule(this)

        val prefs = getSharedPreferences("calculator_settings", MODE_PRIVATE)
        settings = EngineSettings(
            if (prefs.getString("angle", "DEGREES") == "RADIANS") AngleMode.RADIANS else AngleMode.DEGREES,
            prefs.getInt("precision", 18).coerceIn(6, 50)
        )
        restoreUiState(state, prefs.getString("mode", "standard-calculator").orEmpty())
        val uiPrefs = getSharedPreferences("ui_state", MODE_PRIVATE)
        val explicitDeepLink = state == null && intent?.action == Intent.ACTION_VIEW && intent?.data?.scheme == "veltrix"
        navigation = AppNavigationState.restore(
            state?.getString(STATE_ROUTE) ?: if (explicitDeepLink) null else uiPrefs.getString(PERSISTED_ROUTE, null),
            toolExists = { platform.registry.get(it) != null },
            converterExists = { it == CURRENCY_ROUTE || platform.converters.categories().containsKey(it) }
        )
        if (explicitDeepLink) routeIntent(intent)

        backCallback = object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                captureCurrentState()
                if (navigation.back() == BackOutcome.NAVIGATED) renderDestination()
                else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        }
        onBackPressedDispatcher.addCallback(this, backCallback)
        renderDestination()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        captureCurrentState()
        if (routeIntent(intent)) renderDestination()
    }

    private fun routeIntent(intent: Intent?): Boolean {
        val data = intent?.data ?: return false
        if (intent.action != Intent.ACTION_VIEW || data.scheme != "veltrix") return false
        val value = android.net.Uri.decode(data.encodedPath.orEmpty().removePrefix("/"))
        return when (data.host) {
            "home" -> {
                navigation.openHome()
                standardMode = value.takeIf { platform.registry.get(it)?.id in setOf("standard-calculator", "scientific-calculator", "programmer-calculator") }
                    ?: "standard-calculator"
                data.getQueryParameter("expression")?.take(256)?.let { standardDraft = it }
                true
            }
            "tool" -> platform.registry.get(value)?.let {
                navigation.openTool(it.id, WorkspaceTab.LIBRARY)
                true
            } ?: false
            "converter" -> value.takeIf { it == CURRENCY_ROUTE || platform.converters.categories().containsKey(it) }?.let {
                converterCategory = it
                data.getQueryParameter("amount")?.toDoubleOrNull()?.takeIf(Double::isFinite)?.let { amount -> converterAmount = amount.toString() }
                if (it == CURRENCY_ROUTE) {
                    data.getQueryParameter("base")?.trim()?.uppercase()?.takeIf { code -> Regex("[A-Z]{3}").matches(code) }?.let { code -> currencyBase = code }
                    data.getQueryParameter("quote")?.trim()?.uppercase()?.takeIf { code -> Regex("[A-Z]{3}").matches(code) }?.let { code -> currencyQuote = code }
                } else {
                    val units = platform.converters.units(it)
                    data.getQueryParameter("from")?.takeIf { unit -> units.any { it.id == unit } }?.let { unit -> converterFromId = unit }
                    data.getQueryParameter("to")?.takeIf { unit -> units.any { it.id == unit } }?.let { unit -> converterToId = unit }
                }
                navigation.openConverter(it)
                true
            } ?: false
            else -> false
        }
    }

    private fun restoreUiState(state: Bundle?, persistedMode: String) {
        standardMode = state?.getString(STATE_MODE) ?: persistedMode.ifBlank { "standard-calculator" }
        standardDraft = state?.getString(STATE_DRAFT)
            ?: getSharedPreferences("ui_state", MODE_PRIVATE).getString("draft", "").orEmpty()
        standardResultValue = state?.getString(STATE_RESULT) ?: "0"
        libraryQuery = state?.getString(STATE_LIBRARY_QUERY).orEmpty()
        librarySubjectPosition = state?.getInt(STATE_LIBRARY_SUBJECT, 0) ?: 0
        historyQuery = state?.getString(STATE_HISTORY_QUERY).orEmpty()
        graphQuery = state?.getString(STATE_GRAPH_QUERY).orEmpty()
        converterCategory = state?.getString(STATE_CONVERTER_CATEGORY) ?: converterCategory
        converterAmount = state?.getString(STATE_CONVERTER_AMOUNT) ?: converterAmount
        converterFromId = state?.getString(STATE_CONVERTER_FROM).orEmpty()
        converterToId = state?.getString(STATE_CONVERTER_TO).orEmpty()
        converterResultValue = state?.getString(STATE_CONVERTER_RESULT).orEmpty()
        currencyBase = state?.getString(STATE_CURRENCY_BASE) ?: currencyBase
        currencyQuote = state?.getString(STATE_CURRENCY_QUOTE) ?: currencyQuote
        toolDrafts.putAll(decodeNestedMap(state?.getString(STATE_TOOL_DRAFTS)))
        toolUnknowns.putAll(decodeStringMap(state?.getString(STATE_TOOL_UNKNOWNS)))
        toolResults.putAll(decodeStringMap(state?.getString(STATE_TOOL_RESULTS)))
    }

    private fun renderDestination() {
        resetActiveViewReferences()
        backCallback.isEnabled = navigation.destination != AppDestination.Home
        when (val destination = navigation.destination) {
            AppDestination.Home -> showHome()
            is AppDestination.Workspace -> when (destination.tab) {
                WorkspaceTab.LIBRARY -> showLibrary()
                WorkspaceTab.CONVERTERS -> showConverters()
                WorkspaceTab.GRAPHS -> showGraphs()
                WorkspaceTab.HISTORY -> showHistory()
            }
            is AppDestination.ToolDetail -> showTool(destination)
            is AppDestination.ConverterDetail -> showConverter(destination.categoryId)
            is AppDestination.GraphDetail -> showGraph(destination.toolId)
            is AppDestination.HistoryDetail -> showHistoryDetail(destination.historyId)
            is AppDestination.Settings -> showSettings(destination.returnTab)
            is AppDestination.WidgetCenter -> showWidgetCenter(destination.returnTab)
        }
    }

    private fun resetActiveViewReferences() {
        activeToolId = null
        activeToolFields = emptyMap()
        activeUnknownSpinner = null
        activeUnknownIds = emptyList()
        activeToolResult = null
        standardInput = null
        standardResult = null
        converterAmountInput = null
        converterFromSpinner = null
        converterToSpinner = null
        converterUnitIds = emptyList()
        currencyAmountInput = null
        currencyBaseInput = null
        currencyQuoteInput = null
        currencyResult = null
    }

    private fun navigate(change: () -> Unit) {
        captureCurrentState()
        change()
        renderDestination()
    }

    private fun captureCurrentState() {
        standardInput?.let { standardDraft = it.text.toString() }
        standardResult?.let { standardResultValue = it.text.toString() }
        activeToolId?.let { id ->
            toolDrafts[id] = activeToolFields.mapValues { (_, view) -> view.valueText() }
            val position = activeUnknownSpinner?.selectedItemPosition ?: 0
            toolUnknowns[id] = position.takeIf { it > 0 }?.let { activeUnknownIds[it - 1] }.orEmpty()
            activeToolResult?.let { toolResults[id] = it.text.toString() }
        }
        converterAmountInput?.let { converterAmount = it.text.toString() }
        converterFromSpinner?.selectedItemPosition?.takeIf { it in converterUnitIds.indices }?.let { converterFromId = converterUnitIds[it] }
        converterToSpinner?.selectedItemPosition?.takeIf { it in converterUnitIds.indices }?.let { converterToId = converterUnitIds[it] }
        currencyAmountInput?.let { converterAmount = it.text.toString() }
        currencyBaseInput?.let { currencyBase = it.text.toString().trim().uppercase() }
        currencyQuoteInput?.let { currencyQuote = it.text.toString().trim().uppercase() }
    }

    private fun root(tagValue: String): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(24, 20, 24, 24)
        setBackgroundColor(Color.WHITE)
        tag = tagValue
        contentDescription = tagValue
    }

    private fun heading(value: String): TextView = TextView(this).apply {
        text = value
        textSize = 24f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Color.BLACK)
        setPadding(0, 8, 0, 12)
    }

    private fun button(value: String, tagValue: String? = null, click: () -> Unit): Button = Button(this).apply {
        text = value
        isAllCaps = false
        tag = tagValue
        contentDescription = tagValue ?: value
        setOnClickListener { click() }
    }

    private fun showHome() {
        val content = root("route-home")
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        header.addView(button("☰", "home-menu") { navigate { navigation.openWorkspace() } })
        header.addView(heading("Veltrix Calculator"), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        content.addView(header)

        val modes = RadioGroup(this).apply { orientation = RadioGroup.HORIZONTAL }
        val ids = linkedMapOf<String, Int>()
        listOf("standard-calculator" to "Standard", "scientific-calculator" to "Scientific", "programmer-calculator" to "Programmer").forEach { (id, label) ->
            val radio = RadioButton(this).apply { text = label; this.id = View.generateViewId() }
            ids[id] = radio.id
            modes.addView(radio)
        }
        modes.check(ids[standardMode] ?: ids.getValue("standard-calculator"))
        modes.setOnCheckedChangeListener { _, checked ->
            standardMode = ids.entries.firstOrNull { it.value == checked }?.key ?: "standard-calculator"
            getSharedPreferences("calculator_settings", MODE_PRIVATE).edit().putString("mode", standardMode).apply()
        }
        content.addView(modes)
        standardInput = EditText(this).apply {
            tag = "standard-input"
            contentDescription = "standard-input"
            hint = if (standardMode == "programmer-calculator") "0xFF & 0x0F" else "2 + 3 × 4"
            textSize = 22f
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_DONE
            setText(standardDraft)
            afterTextChanged { standardDraft = it }
        }
        content.addView(standardInput)
        standardResult = TextView(this).apply {
            tag = "result"
            contentDescription = "result"
            text = standardResultValue
            textSize = 32f
            setTypeface(typeface, Typeface.BOLD)
            setTextIsSelectable(true)
            setPadding(0, 16, 0, 10)
        }
        content.addView(standardResult)
        content.addView(button("Calculate", "calculate") { calculateStandard() })
        val grid = GridLayout(this).apply { columnCount = 4 }
        listOf("7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "(", ")", "+", "^", "%", "!").forEach { key ->
            grid.addView(button(key) { standardInput?.append(key) }, GridLayout.LayoutParams().apply {
                width = 0
                columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
            })
        }
        content.addView(grid)
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.WHITE); addView(content) })
    }

    private fun calculateStandard() {
        val query = standardInput?.text?.toString()?.trim().orEmpty()
        if (query.isBlank()) return
        standardResult?.text = "…"
        val requestInputs = mutableMapOf("expression" to ToolInput(query))
        if (standardMode == "programmer-calculator") {
            requestInputs["bitWidth"] = ToolInput("64")
            requestInputs["signedness"] = ToolInput("signed")
        }
        thread {
            val output = platform.execute(ToolRequest(standardMode, requestInputs, settings = settings))
            if (output.isSuccess) {
                adaptive.recordTool(standardMode)
                history.addStructured(
                    standardMode, platform.registry.get(standardMode)?.subject?.wireName, query, output.primary,
                    HistoryDb.json(requestInputs.mapValues { it.value.value }), HistoryDb.json(output.normalizedInput),
                    JSONObject(output.outputs).toString(), output.schemaVersion, output.metadata["resultUnit"], JSONObject(output.metadata).toString()
                )
            }
            val rendered = if (output.isSuccess) output.primary else "${output.error?.code}: ${output.error?.message}"
            runOnUiThread { standardResultValue = rendered; standardResult?.text = rendered }
        }
    }

    private fun setWorkspaceContent(content: View) {
        val shell = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            tag = "workspace-shell"
            contentDescription = "workspace-shell"
        }
        val frame = FrameLayout(this).apply { addView(content, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)) }
        shell.addView(frame, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        shell.addView(workspaceNavigation(), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        setContentView(shell)
    }

    private fun workspaceNavigation(): View {
        val footer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(8, 6, 8, 8)
            tag = "workspace-bottom-nav"
        }
        val primary = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; tag = "workspace-primary-tabs" }
        val active = activePrimaryTab()
        val labels = mapOf(WorkspaceTab.LIBRARY to "Library", WorkspaceTab.CONVERTERS to "Convert", WorkspaceTab.GRAPHS to "Graphs", WorkspaceTab.HISTORY to "History")
        WorkspaceTab.entries.forEach { tab ->
            val label = labels.getValue(tab)
            val item = button(if (active == tab) "• $label" else label, "nav-${tab.routeToken}") { navigate { navigation.switchTab(tab) } }
                .apply { contentDescription = label }
            primary.addView(item, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }
        footer.addView(primary, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        val settingsActive = navigation.destination is AppDestination.Settings || navigation.destination is AppDestination.WidgetCenter
        footer.addView(button(if (settingsActive) "• Settings" else "Settings", "nav-settings") { navigate { navigation.openSettings() } },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { marginStart = 12 })
        return footer
    }

    private fun activePrimaryTab(): WorkspaceTab? = when (val route = navigation.destination) {
        is AppDestination.Workspace -> route.tab
        is AppDestination.ToolDetail -> route.parentTab
        is AppDestination.ConverterDetail -> WorkspaceTab.CONVERTERS
        is AppDestination.GraphDetail -> WorkspaceTab.GRAPHS
        is AppDestination.HistoryDetail -> WorkspaceTab.HISTORY
        else -> null
    }

    private fun showLibrary() {
        val content = root("route-workspace-library")
        content.addView(heading("Library"))
        val search = EditText(this).apply {
            tag = "library-search"
            contentDescription = "Library search"
            hint = "Search tools, aliases or topics"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_SEARCH
            setSingleLine(true)
            setText(libraryQuery)
        }
        val searchRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        searchRow.addView(search, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        searchRow.addView(button("Clear", "library-search-clear") { search.setText("") })
        content.addView(searchRow)
        val subjects = listOf("ALL") + Subject.entries.map { it.wireName }
        val subjectSpinner = Spinner(this).apply {
            tag = "library-subject"
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, subjects)
            setSelection(librarySubjectPosition.coerceIn(0, subjects.lastIndex))
        }
        content.addView(subjectSpinner)
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(ScrollView(this).apply { addView(list) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        fun renderList() {
            list.removeAllViews()
            val subject = librarySubjectPosition.takeIf { it > 0 }?.let { Subject.entries[it - 1] }
            val tools = if (libraryQuery.isBlank()) platform.registry.all().filter { subject == null || it.subject == subject }
            else searchEngine.search(libraryQuery, subject, AdaptiveEngine.searchBoosts(adaptive.load()), 100).map { it.tool }
            tools.take(250).forEach { tool ->
                list.addView(button("${tool.title}\n${tool.subject.wireName} • ${tool.topic}", "tool-${tool.id}") { navigate { navigation.openTool(tool.id) } })
            }
            if (tools.isEmpty()) list.addView(TextView(this).apply { text = "No confident match" })
        }
        search.afterTextChanged { libraryQuery = it; renderList() }
        subjectSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) { librarySubjectPosition = position; renderList() }
        }
        renderList()
        setWorkspaceContent(content)
    }

    private fun showTool(destination: AppDestination.ToolDetail) {
        val tool = platform.registry.get(destination.toolId)
        if (tool == null) { navigation.openWorkspace(destination.parentTab); renderDestination(); return }
        showToolEnvironment(tool, destination.parentTab)
    }

    private fun showGraph(toolId: String) {
        val tool = platform.registry.get(toolId)
        if (tool == null) { navigation.openWorkspace(WorkspaceTab.GRAPHS); renderDestination(); return }
        showToolEnvironment(tool, WorkspaceTab.GRAPHS)
    }

    private fun showToolEnvironment(tool: ToolDefinition, parentTab: WorkspaceTab) {
        val body = root("route-tool-${tool.id}")
        body.addView(heading(tool.title))
        body.addView(TextView(this).apply { text = "${tool.subject.wireName} • ${tool.category} • ${tool.topic}\n${tool.description}" })
        val scrollerContent = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val fields = linkedMapOf<String, View>()
        val saved = toolDrafts[tool.id].orEmpty()
        tool.inputSchema.forEachIndexed { index, field ->
            val symbol = field.symbol?.takeIf { it != field.id }?.let { " [$it]" }.orEmpty()
            val unit = field.canonicalUnit?.let { " ($it)" }.orEmpty()
            scrollerContent.addView(TextView(this).apply { text = "${field.label}$symbol$unit" })
            val input: View = if (field.kind == InputKind.SELECT) {
                Spinner(this).apply {
                    adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, field.options)
                    setSelection(field.options.indexOf(saved[field.id]).takeIf { it >= 0 } ?: 0)
                }
            } else {
                EditText(this).apply {
                    hint = field.placeholder ?: if (field.required) "Required" else "Optional"
                    inputType = when (field.kind) {
                        InputKind.NUMBER, InputKind.INTEGER -> InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED
                        else -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                    }
                    imeOptions = if (index == tool.inputSchema.lastIndex) EditorInfo.IME_ACTION_DONE else EditorInfo.IME_ACTION_NEXT
                    setSingleLine(field.kind in setOf(InputKind.NUMBER, InputKind.INTEGER, InputKind.DATE))
                    setText(saved[field.id].orEmpty())
                    tag = "tool-input-${field.id}"
                    contentDescription = "${field.label}$unit"
                }
            }
            fields[field.id] = input
            scrollerContent.addView(input)
        }
        val unknownIds = tool.solveTargets.toList()
        val unknownSpinner = if (unknownIds.isNotEmpty()) Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, listOf("Auto") + unknownIds)
            setSelection(unknownIds.indexOf(toolUnknowns[tool.id]).takeIf { it >= 0 }?.plus(1) ?: 0)
            tag = "solve-target"
        } else null
        if (unknownSpinner != null) {
            scrollerContent.addView(TextView(this).apply { text = "Solve for (leave selected field blank)" })
            scrollerContent.addView(unknownSpinner)
        }
        val result = TextView(this).apply {
            tag = "tool-result"
            text = toolResults[tool.id].orEmpty()
            textSize = 24f
            setTextIsSelectable(true)
            setPadding(0, 16, 0, 12)
        }
        scrollerContent.addView(result)
        scrollerContent.addView(button("Calculate", "tool-calculate") { calculateTool(tool, fields, unknownSpinner, unknownIds, result) })
        scrollerContent.addView(button("Back to ${parentTab.routeToken.replaceFirstChar { it.uppercase() }}", "detail-back") { navigate { navigation.back() } })
        body.addView(ScrollView(this).apply { addView(scrollerContent) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        activeToolId = tool.id
        activeToolFields = fields
        activeUnknownSpinner = unknownSpinner
        activeUnknownIds = unknownIds
        activeToolResult = result
        setWorkspaceContent(body)
    }

    private fun calculateTool(tool: ToolDefinition, fields: Map<String, View>, unknownSpinner: Spinner?, unknownIds: List<String>, result: TextView) {
        val inputs = fields.mapValues { (_, view) -> ToolInput(view.valueText().trim()) }
        val unknown = unknownSpinner?.selectedItemPosition?.takeIf { it > 0 }?.let { unknownIds[it - 1] }
        toolDrafts[tool.id] = inputs.mapValues { it.value.value }
        toolUnknowns[tool.id] = unknown.orEmpty()
        result.text = "…"
        thread {
            val output = platform.execute(ToolRequest(tool.id, inputs, unknown, settings))
            if (output.isSuccess) {
                adaptive.recordTool(tool.id)
                if (tool.historyPolicy != HistoryPolicy.DO_NOT_SAVE) history.addStructured(
                    tool.id, tool.subject.wireName, tool.title, output.primary,
                    HistoryDb.json(inputs.mapValues { it.value.value }), HistoryDb.json(output.normalizedInput),
                    JSONObject(output.outputs).toString(), output.schemaVersion, output.metadata["resultUnit"], JSONObject(output.metadata).toString()
                )
            }
            val rendered = if (output.isSuccess) buildString {
                append(output.primary)
                if (output.outputs.size > 1) append("\n" + output.outputs.entries.joinToString(" • ") { "${it.key}: ${it.value}" })
                output.symbolic?.takeIf { it != output.primary }?.let { append("\nExact: $it") }
            } else "${output.error?.code}: ${output.error?.message}"
            runOnUiThread { toolResults[tool.id] = rendered; result.text = rendered }
        }
    }

    private fun showConverters() {
        val content = root("route-workspace-converters")
        content.addView(heading("Converters"))
        content.addView(TextView(this).apply { text = "Choose a category. Each converter opens as its own full-screen environment." })
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        list.addView(button("Live Currency", "converter-currency") { navigate { navigation.openConverter(CURRENCY_ROUTE) } })
        platform.converters.categories().keys.sorted().forEach { category ->
            list.addView(button(category, "converter-${category.lowercase().replace(Regex("[^a-z0-9]+"), "-")}") {
                converterCategory = category
                navigate { navigation.openConverter(category) }
            })
        }
        content.addView(ScrollView(this).apply { addView(list) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setWorkspaceContent(content)
    }

    private fun showConverter(category: String) {
        converterCategory = category
        if (category == CURRENCY_ROUTE) { showCurrency(); return }
        val units = platform.converters.categories()[category]
        if (units.isNullOrEmpty()) { navigation.openWorkspace(WorkspaceTab.CONVERTERS); renderDestination(); return }
        val content = root("route-converter-detail")
        content.addView(heading(category))
        converterUnitIds = units.map { it.id }
        converterAmountInput = EditText(this).apply {
            tag = "converter-amount"
            hint = "Amount"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED
            imeOptions = EditorInfo.IME_ACTION_DONE
            setSingleLine(true)
            setText(converterAmount)
        }
        content.addView(converterAmountInput)
        converterFromSpinner = Spinner(this).apply {
            tag = "converter-from"
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, units.map { "${it.name} (${it.symbol})" })
            setSelection(units.indexOfFirst { it.id == converterFromId }.takeIf { it >= 0 } ?: 0)
        }
        converterToSpinner = Spinner(this).apply {
            tag = "converter-to"
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, units.map { "${it.name} (${it.symbol})" })
            setSelection(units.indexOfFirst { it.id == converterToId }.takeIf { it >= 0 } ?: if (units.size > 1) 1 else 0)
        }
        content.addView(converterFromSpinner)
        content.addView(converterToSpinner)
        val output = TextView(this).apply { tag = "converter-result"; text = converterResultValue; textSize = 24f }
        content.addView(output)
        content.addView(button("Convert", "converter-calculate") {
            val amount = converterAmountInput?.text?.toString()?.toDoubleOrNull()
            if (amount == null) { output.text = "Invalid amount"; return@button }
            val fromIndex = converterFromSpinner?.selectedItemPosition ?: 0
            val toIndex = converterToSpinner?.selectedItemPosition ?: 0
            runCatching { platform.convert(amount, units[fromIndex].id, units[toIndex].id) }
                .onSuccess { converterResultValue = "${it.value} ${it.to.symbol}"; output.text = converterResultValue; adaptive.recordConverter(category) }
                .onFailure { output.text = it.message }
        })
        content.addView(button("Back to Converters", "detail-back") { navigate { navigation.back() } })
        setWorkspaceContent(content)
    }

    private fun showCurrency() {
        val content = root("route-currency-detail")
        content.addView(heading("Live Currency"))
        currencyAmountInput = EditText(this).apply {
            hint = "Amount"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            imeOptions = EditorInfo.IME_ACTION_NEXT; setSingleLine(true); setText(converterAmount)
        }
        currencyBaseInput = EditText(this).apply {
            hint = "Base (USD)"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
            imeOptions = EditorInfo.IME_ACTION_NEXT; setSingleLine(true); setText(currencyBase)
        }
        currencyQuoteInput = EditText(this).apply {
            hint = "Quote (UZS)"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
            imeOptions = EditorInfo.IME_ACTION_DONE; setSingleLine(true); setText(currencyQuote)
        }
        content.addView(currencyAmountInput); content.addView(currencyBaseInput); content.addView(currencyQuoteInput)
        currencyResult = TextView(this).apply { tag = "currency-result"; textSize = 24f }
        content.addView(currencyResult)
        val watcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { captureCurrentState(); renderCurrencyCached(); refreshCurrencyActive(false) }
            override fun afterTextChanged(s: Editable?) = Unit
        }
        currencyAmountInput?.addTextChangedListener(watcher); currencyBaseInput?.addTextChangedListener(watcher); currencyQuoteInput?.addTextChangedListener(watcher)
        content.addView(button("Refresh & Convert", "currency-calculate") { refreshCurrencyActive(true) })
        content.addView(button("Back to Converters", "detail-back") { navigate { navigation.back() } })
        setWorkspaceContent(content)
        renderCurrencyCached()
        refreshCurrencyActive(true)
    }

    private fun currencyInputs(): Triple<Double, String, String>? {
        val amount = currencyAmountInput?.text?.toString()?.toDoubleOrNull() ?: return null
        val base = currencyBaseInput?.text?.toString()?.trim()?.uppercase().orEmpty()
        val quote = currencyQuoteInput?.text?.toString()?.trim()?.uppercase().orEmpty()
        if (!Regex("[A-Z]{3}").matches(base) || !Regex("[A-Z]{3}").matches(quote)) return null
        return Triple(amount, base, quote)
    }

    private fun renderCurrencyCached() {
        val (amount, base, quote) = currencyInputs() ?: return
        currency.convertCached(amount, base, quote)?.let { (value, rate) ->
            currencyResult?.text = "$value ${rate.quote}\n${rate.source} • ${rate.effectiveDate} • ${rate.freshnessLabel()} • verified ${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(rate.fetchedAtEpochMs))}"
        }
    }

    private fun refreshCurrencyActive(force: Boolean) {
        val (amount, base, quote) = currencyInputs() ?: return
        renderCurrencyCached()
        val now = System.currentTimeMillis()
        if (!force && now - lastCurrencyActiveNetworkAt < 5_000) return
        lastCurrencyActiveNetworkAt = now
        thread {
            try {
                val rate = currency.rate(base, quote, forceRefresh = force, maxFreshAgeMs = 60_000)
                val value = amount * rate.rate
                runOnUiThread { currencyResult?.text = "$value ${rate.quote}\n${rate.source} • ${rate.effectiveDate} • ${rate.freshnessLabel()} • verified ${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(rate.fetchedAtEpochMs))}" }
            } catch (error: Exception) {
                runOnUiThread { renderCurrencyCached(); if (currencyResult?.text.isNullOrBlank()) currencyResult?.text = "Unavailable • ${error.message}" }
            }
        }
    }

    private fun showGraphs() {
        val content = root("route-workspace-graphs")
        content.addView(heading("Graphs"))
        val search = EditText(this).apply {
            hint = "Search graph tools"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_SEARCH; setSingleLine(true); setText(graphQuery)
        }
        content.addView(search)
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(ScrollView(this).apply { addView(list) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        fun renderList() {
            list.removeAllViews()
            val graphTools = platform.registry.all().filter { it.graphDefinition != null || it.executorKind == ToolExecutorKind.GRAPH }
                .filter { graphQuery.isBlank() || it.title.contains(graphQuery, true) || it.topic.contains(graphQuery, true) }
            graphTools.forEach { tool -> list.addView(button("${tool.title}\n${tool.topic}", "graph-${tool.id}") { navigate { navigation.openGraph(tool.id) } }) }
            if (graphTools.isEmpty()) list.addView(TextView(this).apply { text = "No graph tool match" })
        }
        search.afterTextChanged { graphQuery = it; renderList() }
        renderList()
        setWorkspaceContent(content)
    }

    private fun showHistory() {
        val content = root("route-workspace-history")
        content.addView(heading("History & Last Used"))
        val lastUsed = AdaptiveEngine.lastUsed5(adaptive.load())
        if (lastUsed.isNotEmpty()) {
            content.addView(TextView(this).apply { text = "Last Used"; setTypeface(typeface, Typeface.BOLD) })
            val recent = HorizontalScrollView(this)
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            lastUsed.mapNotNull(platform.registry::get).forEach { tool ->
                row.addView(button(tool.shortTitle ?: tool.title, "last-used-${tool.id}") { navigate { navigation.openTool(tool.id, WorkspaceTab.HISTORY) } })
            }
            recent.addView(row); content.addView(recent)
        }
        val query = EditText(this).apply {
            tag = "history-search"; hint = "Search history"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_SEARCH; setSingleLine(true); setText(historyQuery)
        }
        content.addView(query)
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(ScrollView(this).apply { addView(list) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        fun loadRows() {
            val generation = historyLoadGeneration.incrementAndGet()
            val requestedQuery = historyQuery
            thread {
                val rows = history.list(requestedQuery)
                runOnUiThread {
                    if (generation != historyLoadGeneration.get() || navigation.destination != AppDestination.Workspace(WorkspaceTab.HISTORY)) return@runOnUiThread
                    list.removeAllViews()
                    rows.forEach { item ->
                        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(8, 8, 8, 8) }
                        box.addView(TextView(this).apply { text = "${item.toolId ?: item.type} • ${DateFormat.getDateTimeInstance().format(Date(item.createdAt))}" })
                        box.addView(TextView(this).apply { text = item.expression; setTypeface(typeface, Typeface.BOLD) })
                        box.addView(TextView(this).apply { text = item.result })
                        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                        controls.addView(button("Open", "history-open-${item.id}") { navigate { navigation.openHistory(item.id) } })
                        controls.addView(button(if (item.favorite) "★" else "☆") { thread { history.favorite(item.id, !item.favorite); runOnUiThread { loadRows() } } })
                        controls.addView(button("Delete") { thread { history.delete(item.id); runOnUiThread { loadRows() } } })
                        box.addView(controls); list.addView(box)
                    }
                    if (rows.isEmpty()) list.addView(TextView(this).apply { text = "No history yet" })
                }
            }
        }
        query.afterTextChanged { historyQuery = it; loadRows() }
        content.addView(button("Clear all") { thread { history.clear(); runOnUiThread { loadRows() } } })
        loadRows()
        setWorkspaceContent(content)
    }

    private fun showHistoryDetail(historyId: Long) {
        val content = root("route-history-detail")
        val item = history.get(historyId)
        content.addView(heading("History Detail"))
        if (item == null) content.addView(TextView(this).apply { text = "This history item no longer exists." })
        else {
            content.addView(TextView(this).apply { text = item.toolId ?: item.type })
            content.addView(TextView(this).apply { text = item.expression; textSize = 20f; setTypeface(typeface, Typeface.BOLD) })
            content.addView(TextView(this).apply { text = item.result; textSize = 24f; setTextIsSelectable(true) })
            item.toolId?.let { toolId ->
                platform.registry.get(toolId)?.let { tool ->
                    content.addView(button("Reopen in ${tool.title}", "history-reopen") {
                        item.structuredInput?.let { raw -> toolDrafts[toolId] = decodeStringMap(raw) }
                        navigate { navigation.openTool(toolId, WorkspaceTab.HISTORY) }
                    })
                }
            }
        }
        content.addView(button("Back to History", "detail-back") { navigate { navigation.back() } })
        setWorkspaceContent(content)
    }

    private fun showSettings(returnTab: WorkspaceTab) {
        val content = root("route-settings")
        content.addView(heading("Settings"))
        content.addView(button("Widget Center", "settings-widgets") { navigate { navigation.openWidgetCenter() } })
        content.addView(button("Scanner") { startActivity(Intent(this, ScannerActivity::class.java)) })
        val angle = Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, listOf("DEGREES", "RADIANS"))
            setSelection(if (settings.angleMode == AngleMode.DEGREES) 0 else 1)
        }
        content.addView(TextView(this).apply { text = "Calculator angle mode" }); content.addView(angle)
        val precision = SeekBar(this).apply { max = 44; progress = settings.precision - 6 }
        val label = TextView(this).apply { text = "Precision: ${settings.precision}" }
        precision.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) { label.text = "Precision: ${progress + 6}" }
            override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
            override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
        })
        content.addView(label); content.addView(precision)
        content.addView(button("Save") {
            settings = EngineSettings(if (angle.selectedItemPosition == 0) AngleMode.DEGREES else AngleMode.RADIANS, precision.progress + 6)
            getSharedPreferences("calculator_settings", MODE_PRIVATE).edit().putString("angle", settings.angleMode.name).putInt("precision", settings.precision).apply()
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show()
        })
        content.addView(button("Reset local personalization") { adaptive.clear(); Toast.makeText(this, "Personalization reset", Toast.LENGTH_SHORT).show() })
        content.addView(TextView(this).apply { text = "Version: ${packageManager.getPackageInfo(packageName, 0).versionName}\nRegistry schema: ${ToolRegistry.SCHEMA_VERSION}\nNo login required. Deterministic calculation stays local." })
        content.addView(button("Back to ${returnTab.routeToken.replaceFirstChar { it.uppercase() }}", "settings-back") { navigate { navigation.back() } })
        setWorkspaceContent(content)
    }

    private fun showWidgetCenter(returnTab: WorkspaceTab) {
        val content = root("route-widget-center")
        content.addView(heading("Widget Center"))
        content.addView(TextView(this).apply { text = "Four purpose-built families use canonical engines, honest currency freshness, independent appWidgetId state, and XS/S/M/L/XL capabilities." })
        val manager = AppWidgetManager.getInstance(this)
        WidgetType.entries.forEach { type ->
            val features = when (type) {
                WidgetType.MINI_CALCULATOR -> "XS result/open → S expression/result → M subset → L keypad → XL percent/sign"
                WidgetType.QUICK_CONVERTER -> "XS result/open → S pair/swap → M amount controls → L/XL richer direct controls"
                WidgetType.CURRENCY_CONVERTER -> "XS cached result → S pair/swap → M editable amount → L/XL refresh + freshness"
                WidgetType.CURRENCY_RATE_BOARD -> "XS one rate → S freshness → M 2 rates → L 3 → XL 4; never editable"
            }
            content.addView(TextView(this).apply { text = "${type.title}\n$features"; textSize = 16f })
            if (manager.isRequestPinAppWidgetSupported) content.addView(button("Add ${type.title}", "widget-add-${type.wireName}") { requestWidgetPin(manager, type) })
        }
        if (!manager.isRequestPinAppWidgetSupported) content.addView(TextView(this).apply { text = "Add widgets from the system widget picker; all four providers remain available there." })
        val configured = WidgetConfigStore(this@MainActivity).all()
        content.addView(TextView(this).apply { text = "Configured independent instances: ${configured.size}"; textSize = 18f })
        configured.forEach { config ->
            content.addView(button("Configure #${config.appWidgetId} • ${config.widgetType.title} • ${config.sizeCapability.uppercase()}", "widget-configure-${config.appWidgetId}") {
                startActivity(Intent(this, WidgetConfigActivity::class.java)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, config.appWidgetId)
                    .putExtra(WidgetConfigActivity.EXTRA_WIDGET_TYPE, config.widgetType.wireName))
            })
        }
        content.addView(button("Back to Settings", "widget-center-back") { navigate { navigation.back() } })
        setWorkspaceContent(ScrollView(this).apply {
            isFillViewport = true
            addView(content)
        })
    }

    private fun requestWidgetPin(manager: AppWidgetManager, type: WidgetType) {
        val provider = ComponentName(this, WidgetRenderer.providerClass(type))
        val callbackIntent = Intent(this, WidgetConfigActivity::class.java)
            .setAction("com.veltrix.calculator.widget.PINNED.${type.wireName}")
            .putExtra(WidgetConfigActivity.EXTRA_WIDGET_TYPE, type.wireName)
        val callback = PendingIntent.getActivity(
            this, 9_200 + type.ordinal, callbackIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_MUTABLE
        )
        val extras = Bundle().apply { putParcelable(AppWidgetManager.EXTRA_APPWIDGET_PREVIEW, WidgetRenderer.preview(this@MainActivity, type)) }
        if (!manager.requestPinAppWidget(provider, extras, callback)) Toast.makeText(this, "Use the system widget picker on this launcher", Toast.LENGTH_LONG).show()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        captureCurrentState()
        outState.putString(STATE_ROUTE, navigation.encode())
        outState.putString(STATE_MODE, standardMode); outState.putString(STATE_DRAFT, standardDraft); outState.putString(STATE_RESULT, standardResultValue)
        outState.putString(STATE_LIBRARY_QUERY, libraryQuery); outState.putInt(STATE_LIBRARY_SUBJECT, librarySubjectPosition)
        outState.putString(STATE_HISTORY_QUERY, historyQuery); outState.putString(STATE_GRAPH_QUERY, graphQuery)
        outState.putString(STATE_CONVERTER_CATEGORY, converterCategory); outState.putString(STATE_CONVERTER_AMOUNT, converterAmount)
        outState.putString(STATE_CONVERTER_FROM, converterFromId); outState.putString(STATE_CONVERTER_TO, converterToId)
        outState.putString(STATE_CONVERTER_RESULT, converterResultValue); outState.putString(STATE_CURRENCY_BASE, currencyBase); outState.putString(STATE_CURRENCY_QUOTE, currencyQuote)
        outState.putString(STATE_TOOL_DRAFTS, encodeNestedMap(toolDrafts)); outState.putString(STATE_TOOL_UNKNOWNS, JSONObject(toolUnknowns).toString()); outState.putString(STATE_TOOL_RESULTS, JSONObject(toolResults).toString())
        super.onSaveInstanceState(outState)
    }

    override fun onResume() {
        super.onResume()
        if ((navigation.destination as? AppDestination.ConverterDetail)?.categoryId == CURRENCY_ROUTE) refreshCurrencyActive(false)
    }

    override fun onPause() {
        captureCurrentState()
        getSharedPreferences("ui_state", MODE_PRIVATE).edit()
            .putString("draft", standardDraft)
            .putString(PERSISTED_ROUTE, navigation.encode())
            .commit()
        super.onPause()
    }

    private fun EditText.afterTextChanged(block: (String) -> Unit) {
        addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = block(s?.toString().orEmpty())
            override fun afterTextChanged(s: Editable?) = Unit
        })
    }

    private fun View.valueText(): String = when (this) {
        is EditText -> text.toString()
        is Spinner -> selectedItem?.toString().orEmpty()
        else -> ""
    }

    private fun encodeNestedMap(value: Map<String, Map<String, String>>): String = JSONObject().apply {
        value.forEach { (key, inner) -> put(key, JSONObject(inner)) }
    }.toString()

    private fun decodeNestedMap(raw: String?): Map<String, Map<String, String>> = runCatching {
        val json = JSONObject(raw ?: return emptyMap())
        json.keys().asSequence().associateWith { decodeStringMap(json.getJSONObject(it).toString()) }
    }.getOrDefault(emptyMap())

    private fun decodeStringMap(raw: String?): Map<String, String> = runCatching {
        val json = JSONObject(raw ?: return emptyMap())
        json.keys().asSequence().associateWith { json.optString(it) }
    }.getOrDefault(emptyMap())

    companion object {
        private const val CURRENCY_ROUTE = "currency"
        private const val STATE_ROUTE = "v4.route"
        private const val PERSISTED_ROUTE = "v4.persisted.route"
        private const val STATE_MODE = "v4.mode"
        private const val STATE_DRAFT = "v4.draft"
        private const val STATE_RESULT = "v4.result"
        private const val STATE_LIBRARY_QUERY = "v4.library.query"
        private const val STATE_LIBRARY_SUBJECT = "v4.library.subject"
        private const val STATE_HISTORY_QUERY = "v4.history.query"
        private const val STATE_GRAPH_QUERY = "v4.graph.query"
        private const val STATE_CONVERTER_CATEGORY = "v4.converter.category"
        private const val STATE_CONVERTER_AMOUNT = "v4.converter.amount"
        private const val STATE_CONVERTER_FROM = "v4.converter.from"
        private const val STATE_CONVERTER_TO = "v4.converter.to"
        private const val STATE_CONVERTER_RESULT = "v4.converter.result"
        private const val STATE_CURRENCY_BASE = "v4.currency.base"
        private const val STATE_CURRENCY_QUOTE = "v4.currency.quote"
        private const val STATE_TOOL_DRAFTS = "v4.tool.drafts"
        private const val STATE_TOOL_UNKNOWNS = "v4.tool.unknowns"
        private const val STATE_TOOL_RESULTS = "v4.tool.results"
    }
}
