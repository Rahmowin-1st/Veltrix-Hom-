package com.veltrix.calculator.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import com.veltrix.calculator.core.ConversionRegistry

class WidgetConfigActivity : Activity() {
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    private lateinit var widgetType: WidgetType
    private lateinit var existing: WidgetConfig
    private lateinit var root: LinearLayout
    private lateinit var themeSpinner: Spinner
    private var modeSpinner: Spinner? = null
    private var categorySpinner: Spinner? = null
    private var fromSpinner: Spinner? = null
    private var toSpinner: Spinner? = null
    private var amountInput: EditText? = null
    private var baseInput: EditText? = null
    private var quoteInput: EditText? = null
    private var quotesInput: EditText? = null
    private var directionSpinner: Spinner? = null
    private val converters = ConversionRegistry.default()

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        setResult(RESULT_CANCELED)
        widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }
        val manager = AppWidgetManager.getInstance(this)
        val stored = WidgetConfigStore(this).load(widgetId)
        widgetType = typeForProvider(manager.getAppWidgetInfo(widgetId)?.provider?.className) ?: stored?.widgetType
            ?: WidgetType.fromWire(intent.getStringExtra(EXTRA_WIDGET_TYPE)) ?: WidgetType.MINI_CALCULATOR
        existing = stored?.takeIf { it.widgetType == widgetType } ?: WidgetConfig.default(widgetId, widgetType)
        build()
    }

    private fun build() {
        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(24, 24, 24, 24) }
        root.addView(TextView(this).apply { text = "Configure ${widgetType.title}"; textSize = 22f; tag = "widget-config-title" })
        root.addView(TextView(this).apply { text = "Independent instance #$widgetId • schema ${WidgetConfig.CURRENT_WIDGET_SCHEMA}" })
        when (widgetType) {
            WidgetType.MINI_CALCULATOR -> buildMini()
            WidgetType.QUICK_CONVERTER -> buildQuickConverter()
            WidgetType.CURRENCY_CONVERTER -> buildCurrencyConverter()
            WidgetType.CURRENCY_RATE_BOARD -> buildRateBoard()
        }
        root.addView(label("Theme"))
        themeSpinner = spinner(listOf("system", "light", "dark"), existing.themeKey)
        themeSpinner.tag = "widget-config-theme"
        root.addView(themeSpinner)
        root.addView(Button(this).apply { text = "Save Widget"; tag = "widget-config-save"; minimumHeight = 48; setOnClickListener { save() } })
        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun buildMini() {
        root.addView(label("Default calculator mode"))
        modeSpinner = spinner(listOf("standard-calculator", "scientific-calculator", "programmer-calculator"), existing.defaultMode).also {
            it.tag = "widget-config-mode"; root.addView(it)
        }
    }

    private fun buildQuickConverter() {
        val categories = converters.categories().keys.toList()
        root.addView(label("Category"))
        categorySpinner = spinner(categories, existing.converterCategory).also { it.tag = "widget-config-category"; root.addView(it) }
        root.addView(label("From unit")); fromSpinner = Spinner(this).also { it.tag = "widget-config-from"; root.addView(it) }
        root.addView(label("To unit")); toSpinner = Spinner(this).also { it.tag = "widget-config-to"; root.addView(it) }
        amountInput = edit("Default amount", WidgetProductRuntime.format(existing.fixedAmount), numeric = true).also { it.tag = "widget-config-amount"; root.addView(it) }
        categorySpinner?.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) { populateUnits(categories[position]) }
        }
        populateUnits(existing.converterCategory.takeIf { it in categories } ?: categories.first())
    }

    private fun populateUnits(category: String) {
        val units = converters.units(category)
        val labels = units.map { "${it.name} (${it.symbol})" }
        fromSpinner?.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, labels)
        toSpinner?.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, labels)
        fromSpinner?.setSelection(units.indexOfFirst { it.id == existing.converterFrom }.takeIf { it >= 0 } ?: 0)
        toSpinner?.setSelection(units.indexOfFirst { it.id == existing.converterTo }.takeIf { it >= 0 } ?: if (units.size > 1) 1 else 0)
    }

    private fun buildCurrencyConverter() {
        amountInput = edit("Default amount", WidgetProductRuntime.format(existing.fixedAmount), numeric = true).also { it.tag = "widget-config-amount"; root.addView(it) }
        baseInput = edit("Base currency (ISO 4217)", existing.currencyBase, numeric = false).also { it.tag = "widget-config-base"; root.addView(it) }
        quoteInput = edit("Quote currency (ISO 4217)", existing.currencyQuote, numeric = false).also { it.tag = "widget-config-quote"; root.addView(it) }
    }

    private fun buildRateBoard() {
        root.addView(TextView(this).apply { text = "Rate Board is non-editable after placement; configure 1–4 quote currencies here." })
        baseInput = edit("Base currency (ISO 4217)", existing.currencyBase, numeric = false).also { it.tag = "widget-config-base"; root.addView(it) }
        quotesInput = edit("Quote currencies (comma separated, 1–4)", existing.currencyQuotes.joinToString(","), numeric = false).also { it.tag = "widget-config-quotes"; root.addView(it) }
        root.addView(label("Display direction"))
        directionSpinner = spinner(listOf("base-to-quote", "bidirectional"), existing.displayDirection).also { it.tag = "widget-config-direction"; root.addView(it) }
    }

    private fun save() {
        val theme = themeSpinner.selectedItem.toString()
        val configured = when (widgetType) {
            WidgetType.MINI_CALCULATOR -> existing.copy(defaultMode = modeSpinner?.selectedItem?.toString().orEmpty(), themeKey = theme)
            WidgetType.QUICK_CONVERTER -> {
                val category = categorySpinner?.selectedItem?.toString().orEmpty()
                val units = converters.units(category)
                val amount = amountInput?.text?.toString()?.toDoubleOrNull()
                val fromIndex = fromSpinner?.selectedItemPosition ?: 0
                val toIndex = toSpinner?.selectedItemPosition ?: 1
                if (units.size < 2 || amount == null || !amount.isFinite() || fromIndex !in units.indices || toIndex !in units.indices || fromIndex == toIndex) {
                    invalid("Choose a valid category, two different units and a finite amount"); return
                }
                existing.copy(converterCategory = category, converterFrom = units[fromIndex].id, converterTo = units[toIndex].id, fixedAmount = amount, themeKey = theme)
            }
            WidgetType.CURRENCY_CONVERTER -> {
                val amount = amountInput?.text?.toString()?.toDoubleOrNull()
                val base = baseInput?.text?.toString()?.trim()?.uppercase().orEmpty()
                val quote = quoteInput?.text?.toString()?.trim()?.uppercase().orEmpty()
                if (amount == null || !amount.isFinite() || !isCurrency(base) || !isCurrency(quote) || base == quote) {
                    invalid("Enter a finite amount and two different 3-letter currency codes"); return
                }
                existing.copy(fixedAmount = amount, currencyBase = base, currencyQuote = quote, currencyQuotes = listOf(quote), themeKey = theme)
            }
            WidgetType.CURRENCY_RATE_BOARD -> {
                val base = baseInput?.text?.toString()?.trim()?.uppercase().orEmpty()
                val quotes = quotesInput?.text?.toString().orEmpty().split(',', ';', ' ').map { it.trim().uppercase() }.filter(String::isNotBlank).distinct()
                if (!isCurrency(base) || quotes.isEmpty() || quotes.size > 4 || quotes.any { !isCurrency(it) || it == base }) {
                    invalid("Use one base and 1–4 different 3-letter quote currency codes"); return
                }
                existing.copy(currencyBase = base, currencyQuote = quotes.first(), currencyQuotes = quotes, displayDirection = directionSpinner?.selectedItem?.toString().orEmpty(), themeKey = theme)
            }
        }.copy(schemaVersion = WidgetConfig.CURRENT_WIDGET_SCHEMA, migrationState = "configured-v4")

        WidgetInteractionStateStore(this).delete(widgetId)
        WidgetRuntimeStore(this).delete(widgetId)
        WidgetRateBoardStore(this).delete(widgetId)
        WidgetConfigStore(this).save(configured)
        WidgetRenderer.update(this, AppWidgetManager.getInstance(this), widgetId, widgetType)
        if (widgetType in setOf(WidgetType.CURRENCY_CONVERTER, WidgetType.CURRENCY_RATE_BOARD)) CurrencyRefreshScheduler.refreshNow(this, "widget-config-$widgetId")
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        finish()
    }

    private fun invalid(message: String) { Toast.makeText(this, message, Toast.LENGTH_LONG).show() }
    private fun isCurrency(value: String) = Regex("[A-Z]{3}").matches(value)
    private fun label(text: String) = TextView(this).apply { this.text = text }
    private fun spinner(values: List<String>, selected: String): Spinner = Spinner(this).apply {
        adapter = ArrayAdapter(this@WidgetConfigActivity, android.R.layout.simple_spinner_dropdown_item, values)
        setSelection(values.indexOf(selected).takeIf { it >= 0 } ?: 0)
    }
    private fun edit(label: String, value: String, numeric: Boolean): EditText = EditText(this).apply {
        hint = label; setText(value); setSingleLine(true)
        inputType = if (numeric) InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED
        else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
    }

    private fun typeForProvider(className: String?): WidgetType? = when (className) {
        MiniCalculatorWidgetProvider::class.java.name -> WidgetType.MINI_CALCULATOR
        QuickConverterWidgetProvider::class.java.name -> WidgetType.QUICK_CONVERTER
        CurrencyConverterWidgetProvider::class.java.name -> WidgetType.CURRENCY_CONVERTER
        CurrencyRateBoardWidgetProvider::class.java.name -> WidgetType.CURRENCY_RATE_BOARD
        else -> null
    }

    companion object { const val EXTRA_WIDGET_TYPE = "widgetType" }
}
