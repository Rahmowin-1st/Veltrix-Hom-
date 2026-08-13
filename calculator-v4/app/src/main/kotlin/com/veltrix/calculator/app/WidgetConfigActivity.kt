package com.veltrix.calculator.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.*
import com.veltrix.calculator.core.InputKind
import com.veltrix.calculator.core.PlatformEngine
import com.veltrix.calculator.core.ToolDefinition

class WidgetConfigActivity:Activity(){
    private var widgetId=AppWidgetManager.INVALID_APPWIDGET_ID
    private val engine=PlatformEngine();private val inputs=linkedMapOf<String,View>();private lateinit var fields:LinearLayout
    private var choices:List<Pair<String,ToolDefinition?>> = emptyList()
    override fun onCreate(state:Bundle?){super.onCreate(state);setResult(RESULT_CANCELED);widgetId=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID);if(widgetId==AppWidgetManager.INVALID_APPWIDGET_ID){finish();return};build()}
    private fun build(){
        choices=listOf("currency-fixed" to null,"currency-interactive" to null)+engine.registry.widgetTools().map{it.id to it}
        val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(24,24,24,24)};root.addView(TextView(this).apply{text="Configure Veltrix Widget";textSize=22f})
        val spinner=Spinner(this).apply{adapter=ArrayAdapter(this@WidgetConfigActivity,android.R.layout.simple_spinner_dropdown_item,choices.map{(id,tool)->tool?.title?:if(id=="currency-interactive")"Interactive Currency" else "Fixed Live Currency"})};root.addView(spinner)
        fields=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};root.addView(fields)
        spinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,i:Int,l:Long){showFields(choices[i].first,choices[i].second)}}
        root.addView(Button(this).apply{text="Save Widget";setOnClickListener{save(choices[spinner.selectedItemPosition].first)}})
        setContentView(ScrollView(this).apply{addView(root)})
    }
    private fun showFields(id:String,tool:ToolDefinition?){fields.removeAllViews();inputs.clear();if(id=="currency-fixed"||id=="currency-interactive"){
        addEdit("amount","Amount","100",true);addEdit("base","Base currency","USD",false);addEdit("quote","Quote currency","UZS",false);return
    };if(tool?.id=="standard-calculator"){fields.addView(TextView(this).apply{text="Standalone keypad needs no preset values."});return};tool?.inputSchema?.forEach{f->if(f.kind==InputKind.SELECT){val s=Spinner(this).apply{adapter=ArrayAdapter(this@WidgetConfigActivity,android.R.layout.simple_spinner_dropdown_item,f.options)};fields.addView(TextView(this).apply{text=f.label});fields.addView(s);inputs[f.id]=s}else addEdit(f.id,f.label,f.placeholder.orEmpty(),f.kind==InputKind.NUMBER||f.kind==InputKind.INTEGER)}}
    private fun addEdit(id:String,label:String,hint:String,numeric:Boolean){fields.addView(TextView(this).apply{text=label});val e=EditText(this).apply{this.hint=hint;if(numeric)inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED};fields.addView(e);inputs[id]=e}
    private fun save(toolId:String){
        val values=inputs.mapValues{(_,v)->when(v){is EditText->v.text.toString().trim();is Spinner->v.selectedItem?.toString().orEmpty();else->""}}
        val config=if(toolId=="currency-fixed"||toolId=="currency-interactive")WidgetConfig(widgetId,toolId,values=emptyMap(),currencyBase=values["base"].orEmpty().ifBlank{"USD"}.uppercase(),currencyQuote=values["quote"].orEmpty().ifBlank{"UZS"}.uppercase(),fixedAmount=values["amount"]?.toDoubleOrNull()?:100.0,schemaVersion=2) else WidgetConfig(widgetId,toolId,values=values.filterValues{it.isNotBlank()},schemaVersion=2)
        WidgetInteractionStateStore(this).delete(widgetId);WidgetRuntimeStore(this).delete(widgetId);WidgetConfigStore(this).save(config);VeltrixToolWidgetProvider.update(this,AppWidgetManager.getInstance(this),widgetId);if(toolId.startsWith("currency"))sendBroadcast(Intent(this,VeltrixToolWidgetProvider::class.java).setAction(VeltrixToolWidgetProvider.ACTION_REFRESH).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,widgetId));setResult(RESULT_OK,Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,widgetId));finish()
    }
}
