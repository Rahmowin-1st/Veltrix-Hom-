package com.veltrix.calculator.app

import android.content.Context

/** Removes the retired schema-v2 generic-widget state during migration, ID reuse, or deletion. */
class WidgetInteractionStateStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("widget_interaction_v2", Context.MODE_PRIVATE)
    @Synchronized fun delete(id: Int) { prefs.edit().remove(id.toString()).commit() }
}

/** Process-independent, appWidgetId-scoped input/result/freshness state for the four V4 families. */
class WidgetRuntimeStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("widget_runtime", Context.MODE_PRIVATE)
    fun expression(id: Int, default: String = "") = prefs.getString("${id}_expr", default).orEmpty()
    fun result(id: Int, default: String = "") = prefs.getString("${id}_result", default).orEmpty()
    fun meta(id: Int, default: String = "") = prefs.getString("${id}_meta", default).orEmpty()
    fun setExpression(id: Int, value: String) { prefs.edit().putString("${id}_expr", value).commit() }
    fun setResult(id: Int, value: String) { prefs.edit().putString("${id}_result", value).commit() }
    fun setMeta(id: Int, value: String) { prefs.edit().putString("${id}_meta", value).commit() }
    fun set(id: Int, expression: String? = null, result: String? = null, meta: String? = null) {
        val editor = prefs.edit()
        expression?.let { editor.putString("${id}_expr", it) }
        result?.let { editor.putString("${id}_result", it) }
        meta?.let { editor.putString("${id}_meta", it) }
        editor.commit()
    }
    fun delete(id: Int) { prefs.edit().remove("${id}_expr").remove("${id}_result").remove("${id}_meta").commit() }
}
