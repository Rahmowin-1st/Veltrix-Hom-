package com.veltrix.calculator.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import com.veltrix.calculator.core.GraphPlatform
import com.veltrix.calculator.core.GraphViewport
import com.veltrix.calculator.core.InputKind
import com.veltrix.calculator.core.PlatformEngine
import com.veltrix.calculator.core.ToolDefinition
import com.veltrix.calculator.core.ToolInput
import com.veltrix.calculator.core.ToolRequest
import java.math.BigDecimal
import java.text.DateFormat
import java.util.Date
import kotlin.concurrent.thread

/** Standalone home-screen micro-tool provider. All normal interactions stay inside RemoteViews. */
class VeltrixToolWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { update(context, manager, it) }
        if (ids.map { WidgetConfigStore(context).load(it) }.filterNotNull().any(::isCurrency)) {
            CurrencyRefreshScheduler.refreshNow(context, "appwidget-update")
        }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle) = update(context, manager, id)

    override fun onDeleted(context: Context, ids: IntArray) {
        val configStore = WidgetConfigStore(context); val stateStore = WidgetInteractionStateStore(context); val runtime = WidgetRuntimeStore(context)
        ids.forEach { id -> configStore.delete(id); stateStore.delete(id); runtime.delete(id) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return
        val config = WidgetConfigStore(context).load(id) ?: WidgetConfig(id, "standard-calculator")
        when {
            config.toolId == "standard-calculator" -> handleStandard(context, id, intent)
            isCurrency(config) -> handleCurrency(context, id, config, intent)
            else -> handleRegistry(context, id, config, intent)
        }
    }

    private fun handleStandard(context: Context, id: Int, intent: Intent) {
        val runtime = WidgetRuntimeStore(context)
        when (intent.action) {
            ACTION_KEY -> runtime.setExpression(id, (runtime.expression(id) + intent.getStringExtra(EXTRA_KEY).orEmpty()).take(96))
            ACTION_BACKSPACE -> runtime.setExpression(id, runtime.expression(id).dropLast(1))
            ACTION_CLEAR -> runtime.set(id, expression = "", result = "0")
            ACTION_EQUALS, ACTION_SOLVE -> calculateStandard(context, id)
        }
        update(context, AppWidgetManager.getInstance(context), id)
    }

    private fun handleCurrency(context: Context, id: Int, config: WidgetConfig, intent: Intent) {
        val runtime = WidgetRuntimeStore(context)
        when (intent.action) {
            ACTION_KEY -> if (isInteractiveCurrency(config)) {
                runtime.setExpression(id, appendCurrencyKey(runtime.expression(id, initialExpression(config)), intent.getStringExtra(EXTRA_KEY).orEmpty()))
                recalcCurrencyFromCache(context, id, config)
                update(context, AppWidgetManager.getInstance(context), id)
            }
            ACTION_BACKSPACE -> if (isInteractiveCurrency(config)) {
                runtime.setExpression(id, runtime.expression(id, initialExpression(config)).dropLast(1)); recalcCurrencyFromCache(context,id,config); update(context,AppWidgetManager.getInstance(context),id)
            }
            ACTION_CLEAR -> if (isInteractiveCurrency(config)) {
                runtime.set(id, expression = "", result = "0"); update(context, AppWidgetManager.getInstance(context), id)
            }
            ACTION_SWAP -> if (isInteractiveCurrency(config)) {
                val swapped = config.copy(currencyBase = config.currencyQuote, currencyQuote = config.currencyBase, schemaVersion = 2)
                WidgetConfigStore(context).save(swapped)
                recalcCurrencyFromCache(context, id, swapped)
                update(context, AppWidgetManager.getInstance(context), id)
                CurrencyRefreshScheduler.refreshNow(context, "widget-swap-$id")
            }
            ACTION_EQUALS, ACTION_SOLVE, ACTION_REFRESH -> refreshAsync(context, id, forceRefresh = true)
        }
    }

    private fun handleRegistry(context: Context, id: Int, config: WidgetConfig, intent: Intent) {
        val platform = PlatformEngine(); val tool = platform.registry.get(config.toolId) ?: return
        val engine = WidgetInteractionEngine(platform); val store = WidgetInteractionStateStore(context)
        var state = engine.reconcile(config, store.load(id))
        state = when (intent.action) {
            ACTION_KEY -> engine.key(tool, state, intent.getStringExtra(EXTRA_KEY).orEmpty())
            ACTION_BACKSPACE -> engine.backspace(tool, state)
            ACTION_CLEAR -> engine.clearField(tool, state)
            ACTION_SIGN -> engine.sign(tool, state)
            ACTION_DECIMAL -> engine.decimal(tool, state)
            ACTION_SEPARATOR -> engine.separator(tool, state)
            ACTION_PREV_FIELD -> engine.next(tool, state, -1)
            ACTION_NEXT_FIELD -> engine.next(tool, state, 1)
            ACTION_APPLY -> engine.apply(tool, state)
            ACTION_OPTION -> engine.cycleOption(tool, state)
            ACTION_UNIT -> engine.cycleUnit(tool, state)
            ACTION_RESET -> engine.reset(config)
            ACTION_EQUALS, ACTION_SOLVE, ACTION_REFRESH -> engine.solve(config, state)
            else -> state
        }
        store.save(state)
        WidgetConfigStore(context).save(config.copy(values = state.values, preferredUnits = state.units, schemaVersion = 2))
        update(context, AppWidgetManager.getInstance(context), id)
    }

    private fun calculateStandard(context: Context, id: Int) {
        val runtime = WidgetRuntimeStore(context); val expr = runtime.expression(id); if (expr.isBlank()) return
        val out = PlatformEngine().execute(ToolRequest("standard-calculator", mapOf("expression" to ToolInput(expr))))
        val text = if (out.isSuccess) out.primary else "Error"
        runtime.setResult(id, text)
        if (out.isSuccess) HistoryDb(context).addStructured("standard-calculator", "Math", expr, text, null, expr, out.primary, 1, null, "{\"source\":\"widget\"}")
    }

    private fun refreshAsync(context: Context, id: Int, forceRefresh: Boolean) {
        val pending = goAsync()
        thread(name = "veltrix-widget-refresh-$id") {
            try { refreshCurrencyWidget(context, id, forceRefresh) }
            finally { update(context, AppWidgetManager.getInstance(context), id); pending?.finish() }
        }
    }

    companion object {
        const val ACTION_KEY = "com.veltrix.calculator.widget.KEY"
        const val ACTION_CLEAR = "com.veltrix.calculator.widget.CLEAR"
        const val ACTION_EQUALS = "com.veltrix.calculator.widget.EQUALS"
        const val ACTION_REFRESH = "com.veltrix.calculator.widget.REFRESH"
        const val ACTION_SWAP = "com.veltrix.calculator.widget.SWAP"
        const val ACTION_BACKSPACE = "com.veltrix.calculator.widget.BACKSPACE"
        const val ACTION_SIGN = "com.veltrix.calculator.widget.SIGN"
        const val ACTION_DECIMAL = "com.veltrix.calculator.widget.DECIMAL"
        const val ACTION_SEPARATOR = "com.veltrix.calculator.widget.SEPARATOR"
        const val ACTION_PREV_FIELD = "com.veltrix.calculator.widget.PREV_FIELD"
        const val ACTION_NEXT_FIELD = "com.veltrix.calculator.widget.NEXT_FIELD"
        const val ACTION_APPLY = "com.veltrix.calculator.widget.APPLY"
        const val ACTION_SOLVE = "com.veltrix.calculator.widget.SOLVE"
        const val ACTION_OPTION = "com.veltrix.calculator.widget.OPTION"
        const val ACTION_UNIT = "com.veltrix.calculator.widget.UNIT"
        const val ACTION_RESET = "com.veltrix.calculator.widget.RESET"
        const val EXTRA_KEY = "key"

        private val digitButtons = linkedMapOf(R.id.w0 to "0", R.id.w1 to "1", R.id.w2 to "2", R.id.w3 to "3", R.id.w4 to "4", R.id.w5 to "5", R.id.w6 to "6", R.id.w7 to "7", R.id.w8 to "8", R.id.w9 to "9")
        private val operatorButtons = linkedMapOf(R.id.wadd to "+", R.id.wsub to "-", R.id.wmul to "*", R.id.wdiv to "/")
        private fun isCurrency(c: WidgetConfig) = c.toolId == "currency" || c.toolId == "currency-fixed" || c.toolId == "currency-interactive"
        private fun isInteractiveCurrency(c: WidgetConfig) = c.toolId == "currency-interactive"
        private fun initialExpression(c: WidgetConfig) = if (isInteractiveCurrency(c)) fmt(c.fixedAmount) else ""
        private fun appendCurrencyKey(current: String, key: String): String {
            if (key == "." && current.contains('.')) return current
            if (key !in (listOf(".") + ('0'..'9').map(Char::toString))) return current
            return (current + key).take(24)
        }

        fun update(context: Context, manager: AppWidgetManager, id: Int) {
            val config = WidgetConfigStore(context).load(id) ?: WidgetConfig(id, "standard-calculator")
            val rv = RemoteViews(context.packageName, R.layout.widget_tool)
            val options = manager.getAppWidgetOptions(id)
            val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 180)
            val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
            val capability = when { width < 150 || height < 100 -> "small"; width >= 250 && height >= 180 -> "large"; else -> "medium" }
            resetVisibility(rv)
            rv.setTextViewText(R.id.widget_title, when {
                config.toolId == "currency-interactive" -> "Interactive Currency • $capability"
                isCurrency(config) -> "Live Currency • $capability"
                else -> PlatformEngine().registry.get(config.toolId)?.shortTitle ?: PlatformEngine().registry.get(config.toolId)?.title ?: "Veltrix"
            })
            when {
                config.toolId == "standard-calculator" -> configureStandard(context, rv, id, capability)
                isInteractiveCurrency(config) -> configureInteractiveCurrency(context, rv, id, config, capability)
                isCurrency(config) -> configureFixedCurrency(context, rv, id, config)
                else -> configureRegistryTool(context, rv, id, config, capability)
            }
            manager.updateAppWidget(id, rv)
        }

        private fun resetVisibility(rv: RemoteViews) {
            rv.setViewVisibility(R.id.widget_graph, View.GONE); rv.setViewVisibility(R.id.widget_meta, View.GONE)
            rv.setViewVisibility(R.id.widget_field_controls, View.GONE); rv.setViewVisibility(R.id.widget_extra_controls, View.GONE)
            rv.setViewVisibility(R.id.widget_keypad, View.GONE); rv.setViewVisibility(R.id.widget_refresh, View.GONE)
            rv.setTextViewText(R.id.widget_meta, "")
        }

        private fun configureStandard(context: Context, rv: RemoteViews, id: Int, capability: String) {
            val runtime = WidgetRuntimeStore(context)
            rv.setViewVisibility(R.id.widget_keypad, if (capability == "small") View.GONE else View.VISIBLE)
            rv.setViewVisibility(R.id.widget_refresh, if (capability == "small") View.VISIBLE else View.GONE)
            rv.setTextViewText(R.id.widget_refresh, "="); rv.setOnClickPendingIntent(R.id.widget_refresh, actionIntent(context,id,ACTION_EQUALS,null,R.id.widget_refresh))
            rv.setTextViewText(R.id.widget_expression, runtime.expression(id)); rv.setTextViewText(R.id.widget_result, runtime.result(id, "0"))
            digitButtons.forEach { (view, key) -> rv.setViewVisibility(view,View.VISIBLE); rv.setOnClickPendingIntent(view, actionIntent(context, id, ACTION_KEY, key, view)) }
            operatorButtons.forEach { (view, key) -> rv.setViewVisibility(view, View.VISIBLE); rv.setTextViewText(view, when(key){"*"->"×";"/"->"÷";"-"->"−";else->key}); rv.setOnClickPendingIntent(view, actionIntent(context,id,ACTION_KEY,key,view)) }
            rv.setTextViewText(R.id.weq, "="); rv.setTextViewText(R.id.wclear,"C")
            rv.setOnClickPendingIntent(R.id.wclear, actionIntent(context,id,ACTION_CLEAR,null,R.id.wclear)); rv.setOnClickPendingIntent(R.id.weq,actionIntent(context,id,ACTION_EQUALS,null,R.id.weq))
        }

        private fun configureFixedCurrency(context: Context, rv: RemoteViews, id: Int, c: WidgetConfig) {
            val runtime = WidgetRuntimeStore(context)
            rv.setViewVisibility(R.id.widget_refresh, View.VISIBLE); rv.setViewVisibility(R.id.widget_meta, View.VISIBLE)
            rv.setTextViewText(R.id.widget_expression, "${fmt(c.fixedAmount)} ${c.currencyBase} → ${c.currencyQuote}")
            rv.setTextViewText(R.id.widget_result, runtime.result(id, "Tap Refresh")); rv.setTextViewText(R.id.widget_meta, runtime.meta(id, "No verified rate cached"))
            rv.setOnClickPendingIntent(R.id.widget_refresh, actionIntent(context,id,ACTION_REFRESH,null,R.id.widget_refresh))
        }

        private fun configureInteractiveCurrency(context: Context, rv: RemoteViews, id: Int, c: WidgetConfig, capability: String) {
            val runtime = WidgetRuntimeStore(context); val expr = runtime.expression(id, initialExpression(c))
            rv.setViewVisibility(R.id.widget_keypad, if (capability == "small") View.GONE else View.VISIBLE); rv.setViewVisibility(R.id.widget_meta, View.VISIBLE)
            rv.setViewVisibility(R.id.widget_refresh, if (capability == "small") View.VISIBLE else View.GONE)
            rv.setTextViewText(R.id.widget_refresh,"Refresh"); rv.setOnClickPendingIntent(R.id.widget_refresh,actionIntent(context,id,ACTION_REFRESH,null,R.id.widget_refresh))
            rv.setTextViewText(R.id.widget_expression, "$expr ${c.currencyBase} → ${c.currencyQuote}"); rv.setTextViewText(R.id.widget_result,runtime.result(id,"=")); rv.setTextViewText(R.id.widget_meta,runtime.meta(id,"Rate refreshes on = / swap"))
            digitButtons.forEach { (view,key) -> rv.setViewVisibility(view,View.VISIBLE); rv.setOnClickPendingIntent(view,actionIntent(context,id,ACTION_KEY,key,view)) }
            rv.setViewVisibility(R.id.wdiv,View.VISIBLE);rv.setTextViewText(R.id.wdiv,"⌫");rv.setOnClickPendingIntent(R.id.wdiv,actionIntent(context,id,ACTION_BACKSPACE,null,R.id.wdiv))
            rv.setViewVisibility(R.id.wmul,View.GONE)
            rv.setViewVisibility(R.id.wsub,View.VISIBLE); rv.setTextViewText(R.id.wsub,"."); rv.setOnClickPendingIntent(R.id.wsub,actionIntent(context,id,ACTION_KEY,".",R.id.wsub))
            rv.setViewVisibility(R.id.wadd,View.VISIBLE); rv.setTextViewText(R.id.wadd,"⇄"); rv.setOnClickPendingIntent(R.id.wadd,actionIntent(context,id,ACTION_SWAP,null,R.id.wadd))
            rv.setTextViewText(R.id.weq,"="); rv.setTextViewText(R.id.wclear,"C"); rv.setOnClickPendingIntent(R.id.wclear,actionIntent(context,id,ACTION_CLEAR,null,R.id.wclear)); rv.setOnClickPendingIntent(R.id.weq,actionIntent(context,id,ACTION_EQUALS,null,R.id.weq))
        }

        private fun configureRegistryTool(context: Context, rv: RemoteViews, id: Int, c: WidgetConfig, capability: String) {
            val platform = PlatformEngine(); val tool = platform.registry.get(c.toolId) ?: return
            val engine = WidgetInteractionEngine(platform); val store = WidgetInteractionStateStore(context)
            var state = engine.reconcile(c, store.load(id)); if (state.result.isBlank()) state = engine.solve(c,state)
            store.save(state)
            val selected = engine.selectedField(tool,state)
            val summary = state.values.entries.filter { it.value.isNotBlank() }.joinToString(" • ") { "${it.key}=${it.value}" }.ifBlank { "Select a field" }
            rv.setTextViewText(R.id.widget_expression, summary.take(180)); rv.setTextViewText(R.id.widget_result, formatRegistryResult(tool,state))
            rv.setViewVisibility(R.id.widget_meta, if(capability=="large")View.VISIBLE else View.GONE)
            rv.setTextViewText(R.id.widget_meta, "${state.phase.name} • schema ${state.schemaVersion} • rev ${state.revision}${state.graphSignature.takeIf(String::isNotBlank)?.let{" • graph $it"}?:""}")
            rv.setViewVisibility(R.id.widget_field_controls, if(capability=="small")View.GONE else View.VISIBLE)
            rv.setTextViewText(R.id.widget_field, selected?.let { "${it.label}: ${state.buffer.ifBlank{"—"}}${state.units[it.id]?.let{u->" $u"}?:""}" } ?: "No input")
            rv.setOnClickPendingIntent(R.id.wprev,actionIntent(context,id,ACTION_PREV_FIELD,null,R.id.wprev));rv.setOnClickPendingIntent(R.id.wnext,actionIntent(context,id,ACTION_NEXT_FIELD,null,R.id.wnext))
            if (capability == "small") {
                rv.setViewVisibility(R.id.widget_refresh,View.VISIBLE);rv.setTextViewText(R.id.widget_refresh,"Solve");rv.setOnClickPendingIntent(R.id.widget_refresh,actionIntent(context,id,ACTION_SOLVE,null,R.id.widget_refresh))
            } else configureSchemaKeypad(context,rv,id,tool,selected,capability)
            renderGraph(c.copy(values=state.values))?.let { bmp -> rv.setViewVisibility(R.id.widget_graph, View.VISIBLE); rv.setImageViewBitmap(R.id.widget_graph,bmp) }
        }

        private fun configureSchemaKeypad(context:Context,rv:RemoteViews,id:Int,tool:ToolDefinition,field:com.veltrix.calculator.core.InputFieldDefinition?,capability:String){
            rv.setViewVisibility(R.id.widget_keypad,View.VISIBLE)
            digitButtons.forEach{(view,key)->rv.setViewVisibility(view,View.VISIBLE);rv.setTextViewText(view,key);rv.setOnClickPendingIntent(view,actionIntent(context,id,ACTION_KEY,key,view))}
            rv.setTextViewText(R.id.wdiv,"⌫");rv.setOnClickPendingIntent(R.id.wdiv,actionIntent(context,id,ACTION_BACKSPACE,null,R.id.wdiv))
            rv.setTextViewText(R.id.wmul,"±");rv.setOnClickPendingIntent(R.id.wmul,actionIntent(context,id,ACTION_SIGN,null,R.id.wmul))
            rv.setTextViewText(R.id.wsub,".");rv.setOnClickPendingIntent(R.id.wsub,actionIntent(context,id,ACTION_DECIMAL,null,R.id.wsub))
            rv.setTextViewText(R.id.wclear,"C");rv.setOnClickPendingIntent(R.id.wclear,actionIntent(context,id,ACTION_CLEAR,null,R.id.wclear))
            rv.setTextViewText(R.id.wadd,"APPLY");rv.setOnClickPendingIntent(R.id.wadd,actionIntent(context,id,ACTION_APPLY,null,R.id.wadd))
            rv.setTextViewText(R.id.weq,"SOLVE");rv.setOnClickPendingIntent(R.id.weq,actionIntent(context,id,ACTION_SOLVE,null,R.id.weq))
            rv.setViewVisibility(R.id.widget_extra_controls,if(capability=="large"||field?.kind==InputKind.SELECT)View.VISIBLE else View.GONE)
            rv.setViewVisibility(R.id.woption,View.VISIBLE);rv.setViewVisibility(R.id.wunit,View.VISIBLE);rv.setViewVisibility(R.id.wswap,View.VISIBLE);rv.setViewVisibility(R.id.wreset,View.VISIBLE)
            when(field?.kind){
                InputKind.SELECT->{rv.setTextViewText(R.id.woption,"Next option");rv.setOnClickPendingIntent(R.id.woption,actionIntent(context,id,ACTION_OPTION,null,R.id.woption));rv.setViewVisibility(R.id.wunit,View.GONE);rv.setViewVisibility(R.id.wswap,View.GONE)}
                InputKind.DATASET,InputKind.VECTOR,InputKind.MATRIX->{rv.setTextViewText(R.id.woption,",");rv.setOnClickPendingIntent(R.id.woption,actionIntent(context,id,ACTION_SEPARATOR,null,R.id.woption));configureUnitButton(context,rv,id,field)}
                InputKind.EXPRESSION,InputKind.TEXT->{rv.setTextViewText(R.id.woption,"+");rv.setOnClickPendingIntent(R.id.woption,actionIntent(context,id,ACTION_KEY,"+",R.id.woption));rv.setTextViewText(R.id.wunit,"−");rv.setOnClickPendingIntent(R.id.wunit,actionIntent(context,id,ACTION_KEY,"-",R.id.wunit));rv.setTextViewText(R.id.wswap,"×");rv.setOnClickPendingIntent(R.id.wswap,actionIntent(context,id,ACTION_KEY,"*",R.id.wswap));rv.setTextViewText(R.id.wreset,"÷");rv.setOnClickPendingIntent(R.id.wreset,actionIntent(context,id,ACTION_KEY,"/",R.id.wreset));return}
                else->configureUnitButton(context,rv,id,field)
            }
            rv.setTextViewText(R.id.wreset,"Reset");rv.setOnClickPendingIntent(R.id.wreset,actionIntent(context,id,ACTION_RESET,null,R.id.wreset));rv.setViewVisibility(R.id.wswap,View.GONE)
        }

        private fun configureUnitButton(context:Context,rv:RemoteViews,id:Int,field:com.veltrix.calculator.core.InputFieldDefinition?){
            if(field?.canonicalUnit==null)rv.setViewVisibility(R.id.wunit,View.GONE) else {rv.setTextViewText(R.id.wunit,"Unit");rv.setOnClickPendingIntent(R.id.wunit,actionIntent(context,id,ACTION_UNIT,null,R.id.wunit))}
        }

        private fun formatRegistryResult(tool:ToolDefinition,state:WidgetInteractionState):String = when(tool.id){
            "quadratic-solver"->buildString{append("x₁/x₂: ").append(state.outputs["roots"]?:state.result);state.outputs["discriminant"]?.let{append("\nΔ: ").append(it)}}
            "vieta"->"Σ: ${state.outputs["sum"]?:"—"} • Π: ${state.outputs["product"]?:"—"}"
            "discriminant"->"Δ: ${state.outputs["discriminant"]?:state.result}\n${state.outputs["classification"].orEmpty()}"
            else->if(state.outputs.size in 2..3) state.outputs.entries.joinToString(" • "){"${it.key}: ${it.value}"} else state.result.ifBlank{"Configure"}
        }

        fun refreshCurrencyWidget(context: Context, id: Int, forceRefresh: Boolean, repository: CurrencyRepository = CurrencyRepository(context)) {
            val c = WidgetConfigStore(context).load(id) ?: return
            if (!isCurrency(c)) return
            val runtime = WidgetRuntimeStore(context)
            try {
                val amount = if (isInteractiveCurrency(c)) runtime.expression(id,initialExpression(c)).toDoubleOrNull() ?: throw IllegalArgumentException("Enter an amount") else c.fixedAmount
                val (value,rate)=repository.convertAmount(amount,c.currencyBase,c.currencyQuote,forceRefresh)
                runtime.set(id,result="${fmt(value)} ${rate.quote}",meta=currencyMeta(rate))
            } catch(e:Exception) { runtime.set(id,result="Unavailable",meta=e.message ?: "Refresh failed") }
        }

        private fun recalcCurrencyFromCache(context:Context,id:Int,c:WidgetConfig){
            if(!isInteractiveCurrency(c))return
            val runtime=WidgetRuntimeStore(context);val amount=runtime.expression(id,initialExpression(c)).toDoubleOrNull()?:return
            CurrencyRepository(context).convertCached(amount,c.currencyBase,c.currencyQuote)?.let{(value,rate)->runtime.set(id,result="${fmt(value)} ${rate.quote}",meta=currencyMeta(rate))}
        }

        private fun currencyMeta(rate:CurrencyRateRecord):String{
            val freshness=if(rate.stale)"STALE" else if(rate.fromCache)"CURRENT CACHE" else "CURRENT FETCH"
            val fetched=DateFormat.getDateTimeInstance(DateFormat.SHORT,DateFormat.SHORT).format(Date(rate.fetchedAtEpochMs))
            return "Rate date ${rate.effectiveDate} • verified $fetched • ${rate.source} • $freshness"
        }

        /** Called after a verified background fetch. Fixed amount remains unchanged; only rate-derived output changes. */
        fun refreshCurrencyWidgetsFromCache(context: Context) {
            val manager=AppWidgetManager.getInstance(context); val runtime=WidgetRuntimeStore(context); val repo=CurrencyRepository(context)
            WidgetConfigStore(context).all().filter(::isCurrency).forEach { c ->
                val amount=if(isInteractiveCurrency(c))runtime.expression(c.appWidgetId,initialExpression(c)).toDoubleOrNull()?:c.fixedAmount else c.fixedAmount
                repo.convertCached(amount,c.currencyBase,c.currencyQuote)?.let{(value,rate)->runtime.set(c.appWidgetId,result="${fmt(value)} ${rate.quote}",meta=currencyMeta(rate))}
                update(context,manager,c.appWidgetId)
            }
        }

        private fun renderGraph(c: WidgetConfig): Bitmap? = when(c.toolId){
            "graph-functions"->renderFunctionGraph(c.values["expressions"].orEmpty(),c.values)
            "graph-parabola"->{
                val a=c.values["a"]?.toDoubleOrNull()?:return null;val form=c.values["form"].orEmpty().ifBlank{"vertex"}
                val expression=if(form=="standard"){val b=c.values["b"]?.toDoubleOrNull()?:0.0;val cc=c.values["c"]?.toDoubleOrNull()?:0.0;"($a)*x^2+($b)*x+($cc)"}else{val h=c.values["h"]?.toDoubleOrNull()?:0.0;val k=c.values["k"]?.toDoubleOrNull()?:0.0;"($a)*(x-($h))^2+($k)"}
                renderFunctionGraph(expression,c.values)
            }
            else->null
        }

        private fun renderFunctionGraph(expressionsRaw:String,values:Map<String,String>):Bitmap?=runCatching{
            val expressions=expressionsRaw.split(';','\n').map(String::trim).filter(String::isNotEmpty);if(expressions.isEmpty())return null
            fun d(key:String,default:Double)=values[key]?.toDoubleOrNull()?:default
            val viewport=GraphViewport(d("minX",-10.0),d("maxX",10.0),d("minY",-10.0),d("maxY",10.0));val bundle=GraphPlatform().functions(expressions,viewport,samples=241)
            val w=360;val h=160;val bmp=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);val canvas=Canvas(bmp);canvas.drawColor(Color.WHITE)
            val axis=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=Color.LTGRAY;strokeWidth=1f};val curve=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=Color.BLACK;strokeWidth=2f;style=Paint.Style.STROKE}
            fun px(x: Double) = ((x - viewport.minX) / (viewport.maxX - viewport.minX) * w).toFloat()
            fun py(y: Double) = (h - (y - viewport.minY) / (viewport.maxY - viewport.minY) * h).toFloat()
            if(viewport.minX<=0&&viewport.maxX>=0)canvas.drawLine(px(0.0),0f,px(0.0),h.toFloat(),axis);if(viewport.minY<=0&&viewport.maxY>=0)canvas.drawLine(0f,py(0.0),w.toFloat(),py(0.0),axis)
            bundle.series.forEach{series->series.segments.forEach{seg->for(i in 1 until seg.points.size){val a=seg.points[i-1];val b=seg.points[i];if(a.y in viewport.minY..viewport.maxY||b.y in viewport.minY..viewport.maxY)canvas.drawLine(px(a.x),py(a.y.coerceIn(viewport.minY,viewport.maxY)),px(b.x),py(b.y.coerceIn(viewport.minY,viewport.maxY)),curve)}}};bmp
        }.getOrNull()

        private fun actionIntent(context:Context,id:Int,action:String,key:String?,viewId:Int):PendingIntent{
            val i=Intent(context,VeltrixToolWidgetProvider::class.java).setAction(action).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).addFlags(Intent.FLAG_RECEIVER_FOREGROUND);key?.let{i.putExtra(EXTRA_KEY,it)}
            return PendingIntent.getBroadcast(context,id*1000+viewId,i,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        private fun fmt(v:Double)=BigDecimal.valueOf(v).stripTrailingZeros().toPlainString()
    }
}
