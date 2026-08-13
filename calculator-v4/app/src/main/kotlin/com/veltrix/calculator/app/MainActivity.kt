package com.veltrix.calculator.app

import android.app.Activity
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.*
import com.veltrix.calculator.core.*
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date
import kotlin.concurrent.thread

/** Functional verification harness only. Final presentation belongs to the Front-end Agent. */
class MainActivity:Activity(){
    private val platform=PlatformEngine()
    private lateinit var history:HistoryDb
    private lateinit var adaptive:PersonalizationStore
    private lateinit var currency:CurrencyRepository
    private var settings=EngineSettings()
    private var currentScreen="standard"
    private var standardMode="standard-calculator"
    private var standardInput:EditText?=null
    private var standardResult:TextView?=null
    private var currencyAmountInput:EditText?=null
    private var currencyBaseInput:EditText?=null
    private var currencyQuoteInput:EditText?=null
    private var currencyResult:TextView?=null
    private var lastCurrencyActiveNetworkAt=0L

    override fun onCreate(state:Bundle?){
        super.onCreate(state);history=HistoryDb(this);adaptive=PersonalizationStore(this);currency=CurrencyRepository(this);CurrencyRefreshScheduler.ensure(this)
        val prefs=getSharedPreferences("calculator_settings",MODE_PRIVATE);settings=EngineSettings(if(prefs.getString("angle","DEGREES")=="RADIANS")AngleMode.RADIANS else AngleMode.DEGREES,prefs.getInt("precision",18).coerceIn(6,50))
        currentScreen=state?.getString("screen")?:"standard";standardMode=state?.getString("mode")?:prefs.getString("mode","standard-calculator").orEmpty().ifBlank{"standard-calculator"}
        when(currentScreen){"library"->showLibrary();"converters"->showConverters();"currency"->showCurrency();"history"->showHistory();"settings"->showSettings();"widgets"->showWidgets();else->showStandard(state?.getString("draft"),state?.getString("result"))}
    }

    private fun root()=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(24,20,24,24)}
    private fun heading(text:String)=TextView(this).apply{this.text=text;textSize=24f;setTypeface(typeface,Typeface.BOLD);setPadding(0,8,0,12)}
    private fun button(text:String,tagValue:String?=null,click:()->Unit)=Button(this).apply{this.text=text;isAllCaps=false;tag=tagValue;contentDescription=tagValue?:text;setOnClickListener{click()}}
    private fun nav(root:LinearLayout){val row=HorizontalScrollView(this);val b=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};listOf("Standard" to ::showStandardNoArgs,"Library" to ::showLibrary,"Converters" to ::showConverters,"Graph" to {showTool(platform.registry.require("graph-functions"))},"History" to ::showHistory,"Scanner" to {startActivity(Intent(this,ScannerActivity::class.java))},"Widgets" to ::showWidgets,"Settings" to ::showSettings).forEach{(t,a)->b.addView(button(t,"nav-${t.lowercase()}"){a()})};row.addView(b);root.addView(row)}
    private fun showStandardNoArgs()=showStandard(null,null)

    private fun showStandard(draft:String?=null,restoredResult:String?=null){
        currentScreen="standard";val r=root();r.addView(heading("Veltrix Calculator — Functional Foundation"));nav(r)
        val modes=RadioGroup(this).apply{orientation=RadioGroup.HORIZONTAL};val ids=linkedMapOf<String,Int>();listOf("standard-calculator" to "Standard","scientific-calculator" to "Scientific","programmer-calculator" to "Programmer").forEach{(id,label)->val rb=RadioButton(this).apply{this.text=label;this.id=View.generateViewId()};ids[id]=rb.id;modes.addView(rb)};modes.check(ids[standardMode]?:ids.getValue("standard-calculator"));modes.setOnCheckedChangeListener{_,checked->standardMode=ids.entries.firstOrNull{it.value==checked}?.key?:"standard-calculator";getSharedPreferences("calculator_settings",MODE_PRIVATE).edit().putString("mode",standardMode).apply()};r.addView(modes)
        standardInput=EditText(this).apply{tag="standard-input";contentDescription="standard-input";hint=if(standardMode=="programmer-calculator")"0xFF & 0x0F" else "2 + 3 × 4";textSize=22f;inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS;setText(draft?:getSharedPreferences("ui_state",MODE_PRIVATE).getString("draft","").orEmpty())};r.addView(standardInput)
        standardResult=TextView(this).apply{tag="result";contentDescription="result";text=restoredResult?:"0";textSize=32f;setTypeface(typeface,Typeface.BOLD);setTextIsSelectable(true);setPadding(0,16,0,10)};r.addView(standardResult)
        r.addView(button("Calculate","calculate"){calculateStandard()})
        val grid=GridLayout(this).apply{columnCount=4};listOf("7","8","9","/","4","5","6","*","1","2","3","-","0",".","(",")","+","^","%","!").forEach{k->grid.addView(button(k){standardInput?.append(k)},GridLayout.LayoutParams().apply{width=0;columnSpec=GridLayout.spec(GridLayout.UNDEFINED,1f)})};r.addView(grid)
        setContentView(ScrollView(this).apply{addView(r)})
    }

    private fun calculateStandard(){
        val q=standardInput?.text?.toString()?.trim().orEmpty();if(q.isBlank())return;standardResult?.text="…"
        val reqInputs=mutableMapOf("expression" to ToolInput(q));if(standardMode=="programmer-calculator"){reqInputs["bitWidth"]=ToolInput("64");reqInputs["signedness"]=ToolInput("signed")}
        thread{val out=platform.execute(ToolRequest(standardMode,reqInputs,settings=settings));if(out.isSuccess){adaptive.recordTool(standardMode);history.addStructured(standardMode,platform.registry.get(standardMode)?.subject?.wireName,q,out.primary,HistoryDb.json(reqInputs.mapValues{it.value.value}),HistoryDb.json(out.normalizedInput),JSONObject(out.outputs).toString(),out.schemaVersion,out.metadata["resultUnit"],JSONObject(out.metadata).toString())};runOnUiThread{standardResult?.text=if(out.isSuccess)out.primary else "${out.error?.code}: ${out.error?.message}"}}
    }

    private fun showLibrary(){
        currentScreen="library";val r=root();r.addView(heading("Library"));nav(r);val search=EditText(this).apply{tag="library-search";hint="Search tools, aliases or topics"};r.addView(search)
        val subjectSpinner=Spinner(this).apply{adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,listOf("ALL")+Subject.entries.map{it.wireName})};r.addView(subjectSpinner)
        val list=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};r.addView(list)
        fun render(){list.removeAllViews();val subject=subjectSpinner.selectedItemPosition.takeIf{it>0}?.let{Subject.entries[it-1]};val q=search.text.toString();val tools=if(q.isBlank())platform.registry.all().filter{subject==null||it.subject==subject}.take(120) else MegaSearchEngine(platform.registry).search(q,subject,AdaptiveEngine.searchBoosts(adaptive.load()),50).map{it.tool};tools.forEach{t->list.addView(button("${t.title} — ${t.subject.wireName} / ${t.topic}"){showTool(t)})};if(tools.isEmpty())list.addView(TextView(this).apply{text="No confident match"})}
        r.addView(button("Search","library-search-button"){render()});subjectSpinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,i:Int,l:Long){render()}};render();setContentView(ScrollView(this).apply{addView(r)})
    }

    private fun showTool(tool:ToolDefinition){
        currentScreen="tool:${tool.id}";val r=root();r.addView(heading(tool.title));r.addView(TextView(this).apply{text="${tool.subject.wireName} • ${tool.category} • ${tool.topic}\n${tool.description}"})
        val fields=linkedMapOf<String,View>();tool.inputSchema.forEach{f->r.addView(TextView(this).apply{text=f.label+(f.canonicalUnit?.let{" ($it)"}?:"")});if(f.kind==InputKind.SELECT){val s=Spinner(this).apply{adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,f.options)};fields[f.id]=s;r.addView(s)}else{val e=EditText(this).apply{hint=f.placeholder?:if(f.required)"Required" else "Optional";inputType=when(f.kind){InputKind.NUMBER,InputKind.INTEGER->InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED;else->InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS}};fields[f.id]=e;r.addView(e)}}
        val unknowns=tool.formulaDefinition?.solveRules?.keys?.toList().orEmpty();var unknownSpinner:Spinner?=null;if(unknowns.isNotEmpty()){r.addView(TextView(this).apply{text="Solve for (leave selected field blank)"});unknownSpinner=Spinner(this).apply{adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,listOf("Auto")+unknowns)};r.addView(unknownSpinner)}
        val result=TextView(this).apply{tag="tool-result";textSize=24f;setTextIsSelectable(true);setPadding(0,16,0,12)};r.addView(result)
        r.addView(button("Calculate","tool-calculate"){val inputs=fields.mapValues{(_,v)->ToolInput(when(v){is EditText->v.text.toString().trim();is Spinner->v.selectedItem?.toString().orEmpty();else->""})};val unknown=unknownSpinner?.selectedItemPosition?.takeIf{it>0}?.let{unknowns[it-1]};result.text="…";thread{val out=platform.execute(ToolRequest(tool.id,inputs,unknown,settings));if(out.isSuccess){adaptive.recordTool(tool.id);if(tool.historyPolicy!=HistoryPolicy.DO_NOT_SAVE)history.addStructured(tool.id,tool.subject.wireName,tool.title,out.primary,HistoryDb.json(inputs.mapValues{it.value.value}),HistoryDb.json(out.normalizedInput),JSONObject(out.outputs).toString(),out.schemaVersion,out.metadata["resultUnit"],JSONObject(out.metadata).toString())};runOnUiThread{result.text=if(out.isSuccess)buildString{append(out.primary);if(out.outputs.size>1)append("\n"+out.outputs.entries.joinToString(" • "){"${it.key}: ${it.value}"})}else "${out.error?.code}: ${out.error?.message}"}}})
        r.addView(button("← Library"){showLibrary()});setContentView(ScrollView(this).apply{addView(r)})
    }

    private fun showConverters(){
        currentScreen="converters";val r=root();r.addView(heading("Converters"));nav(r);r.addView(button("Live Currency"){showCurrency()})
        val categories=platform.converters.categories();val cat=Spinner(this).apply{adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,categories.keys.toList())};r.addView(cat)
        val amount=EditText(this).apply{tag="converter-amount";hint="Amount";inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED};r.addView(amount)
        val from=Spinner(this);val to=Spinner(this);r.addView(from);r.addView(to);fun units(){val key=cat.selectedItem?.toString()?:return;val us=categories[key].orEmpty();from.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,us.map{"${it.name} (${it.symbol})"});to.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,us.map{"${it.name} (${it.symbol})"});if(us.size>1)to.setSelection(1)};cat.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,i:Int,l:Long){units()}};units()
        val out=TextView(this).apply{tag="converter-result";textSize=24f};r.addView(out);r.addView(button("Convert","converter-calculate"){val key=cat.selectedItem.toString();val us=categories[key].orEmpty();val a=amount.text.toString().toDoubleOrNull();if(a==null){out.text="Invalid amount";return@button};runCatching{platform.convert(a,us[from.selectedItemPosition].id,us[to.selectedItemPosition].id)}.onSuccess{x->out.text="${x.value} ${x.to.symbol}";adaptive.recordConverter(key)}.onFailure{out.text=it.message}});setContentView(ScrollView(this).apply{addView(r)})
    }

    private fun showCurrency(){
        currentScreen="currency";val r=root();r.addView(heading("Live Currency"))
        currencyAmountInput=EditText(this).apply{hint="Amount";setText("100");inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL}
        currencyBaseInput=EditText(this).apply{hint="Base (USD)";setText("USD")};currencyQuoteInput=EditText(this).apply{hint="Quote (UZS)";setText("UZS")}
        r.addView(currencyAmountInput);r.addView(currencyBaseInput);r.addView(currencyQuoteInput);currencyResult=TextView(this).apply{tag="currency-result";textSize=24f};r.addView(currencyResult)
        val watcher=object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,st:Int,c:Int,a:Int){};override fun onTextChanged(s:CharSequence?,st:Int,b:Int,c:Int){renderCurrencyCached();refreshCurrencyActive(false)};override fun afterTextChanged(s:Editable?){}}
        currencyAmountInput?.addTextChangedListener(watcher);currencyBaseInput?.addTextChangedListener(watcher);currencyQuoteInput?.addTextChangedListener(watcher)
        r.addView(button("Refresh & Convert","currency-calculate"){refreshCurrencyActive(true)})
        r.addView(button("← Converters"){showConverters()});setContentView(ScrollView(this).apply{addView(r)});renderCurrencyCached();refreshCurrencyActive(true)
    }

    private fun currencyInputs():Triple<Double,String,String>?{
        val amount=currencyAmountInput?.text?.toString()?.toDoubleOrNull()?:return null;val base=currencyBaseInput?.text?.toString()?.trim()?.uppercase().orEmpty();val quote=currencyQuoteInput?.text?.toString()?.trim()?.uppercase().orEmpty()
        if(!Regex("[A-Z]{3}").matches(base)||!Regex("[A-Z]{3}").matches(quote))return null;return Triple(amount,base,quote)
    }
    private fun renderCurrencyCached(){
        val(a,b,q)=currencyInputs()?:return
        currency.convertCached(a,b,q)?.let{(v,rate)->currencyResult?.text="${v} ${rate.quote}\n${rate.source} • ${rate.effectiveDate} • ${rate.freshnessLabel()} • verified ${DateFormat.getDateTimeInstance(DateFormat.SHORT,DateFormat.SHORT).format(Date(rate.fetchedAtEpochMs))}"}
    }
    private fun refreshCurrencyActive(force:Boolean){
        val(a,b,q)=currencyInputs()?:return;renderCurrencyCached();val now=System.currentTimeMillis();if(!force&&now-lastCurrencyActiveNetworkAt<5_000)return;lastCurrencyActiveNetworkAt=now
        thread{try{val rate=currency.rate(b,q,forceRefresh=force,maxFreshAgeMs=60_000);val v=a*rate.rate;runOnUiThread{currencyResult?.text="${v} ${rate.quote}\n${rate.source} • ${rate.effectiveDate} • ${rate.freshnessLabel()} • verified ${DateFormat.getDateTimeInstance(DateFormat.SHORT,DateFormat.SHORT).format(Date(rate.fetchedAtEpochMs))}"}}catch(e:Exception){runOnUiThread{renderCurrencyCached();if(currencyResult?.text.isNullOrBlank())currencyResult?.text="Unavailable • ${e.message}"}}}
    }

    private fun showHistory(){
        currentScreen="history";val r=root();r.addView(heading("Unified History"));nav(r);val q=EditText(this).apply{hint="Search history"};r.addView(q);val list=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};r.addView(list);fun reload(){list.removeAllViews();history.list(q.text.toString()).forEach{item->val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(8,8,8,8)};box.addView(TextView(this).apply{text="${item.toolId ?: item.type} • ${DateFormat.getDateTimeInstance().format(Date(item.createdAt))}"});box.addView(TextView(this).apply{text=item.expression;setTypeface(typeface,Typeface.BOLD)});box.addView(TextView(this).apply{text=item.result});val row=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};row.addView(button(if(item.favorite)"★" else "☆"){history.favorite(item.id,!item.favorite);reload()});row.addView(button("Delete"){history.delete(item.id);reload()});box.addView(row);list.addView(box)}};r.addView(button("Search"){reload()});r.addView(button("Clear all"){history.clear();reload()});reload();setContentView(ScrollView(this).apply{addView(r)})
    }

    private fun showWidgets(){
        currentScreen="widgets";val r=root();r.addView(heading("Home-screen Widgets"));nav(r);r.addView(TextView(this).apply{text="Widgets run through the same domain engine. Configuration is persisted independently from opening the app."});val manager=AppWidgetManager.getInstance(this);val provider=ComponentName(this,VeltrixToolWidgetProvider::class.java);if(manager.isRequestPinAppWidgetSupported){r.addView(button("Add Veltrix Widget"){manager.requestPinAppWidget(provider,null,PendingIntent.getActivity(this,92,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))})}else r.addView(TextView(this).apply{text="Launcher does not expose pin-widget API; add from the system widget picker."});r.addView(TextView(this).apply{text="Configured widgets: ${WidgetConfigStore(this@MainActivity).all().size}"});setContentView(ScrollView(this).apply{addView(r)})
    }

    private fun showSettings(){
        currentScreen="settings";val r=root();r.addView(heading("Settings"));nav(r);val angle=Spinner(this).apply{adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,listOf("DEGREES","RADIANS"));setSelection(if(settings.angleMode==AngleMode.DEGREES)0 else 1)};r.addView(TextView(this).apply{text="Calculator angle mode"});r.addView(angle);val precision=SeekBar(this).apply{max=44;progress=settings.precision-6};val pl=TextView(this).apply{text="Precision: ${settings.precision}"};precision.setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener{override fun onProgressChanged(s:SeekBar?,p:Int,f:Boolean){pl.text="Precision: ${p+6}"};override fun onStartTrackingTouch(s:SeekBar?){};override fun onStopTrackingTouch(s:SeekBar?){}});r.addView(pl);r.addView(precision);r.addView(button("Save"){settings=EngineSettings(if(angle.selectedItemPosition==0)AngleMode.DEGREES else AngleMode.RADIANS,precision.progress+6);getSharedPreferences("calculator_settings",MODE_PRIVATE).edit().putString("angle",settings.angleMode.name).putInt("precision",settings.precision).apply();Toast.makeText(this,"Saved",Toast.LENGTH_SHORT).show()});r.addView(button("Reset local personalization"){adaptive.clear();Toast.makeText(this,"Personalization reset",Toast.LENGTH_SHORT).show()});r.addView(TextView(this).apply{text="Version: ${packageManager.getPackageInfo(packageName,0).versionName}\nRegistry schema: ${ToolRegistry.SCHEMA_VERSION}\nNo login required. Deterministic calculation stays local."});setContentView(ScrollView(this).apply{addView(r)})
    }

    override fun onSaveInstanceState(out:Bundle){out.putString("screen",if(currentScreen.startsWith("tool:"))"library" else currentScreen);out.putString("mode",standardMode);out.putString("draft",standardInput?.text?.toString());out.putString("result",standardResult?.text?.toString());super.onSaveInstanceState(out)}
    override fun onResume(){super.onResume();if(currentScreen=="currency")refreshCurrencyActive(false)}
    override fun onPause(){standardInput?.text?.toString()?.let{getSharedPreferences("ui_state",MODE_PRIVATE).edit().putString("draft",it).apply()};super.onPause()}
    @Deprecated("Back compatibility") override fun onBackPressed(){if(currentScreen!="standard")showStandard() else super.onBackPressed()}
}
