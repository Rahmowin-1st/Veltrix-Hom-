package com.veltrix.calculator.core

import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.abs

class FormulaEngine internal constructor(
    private val units: UnitRegistry = UnitRegistry(),
    @Suppress("UNUSED_PARAMETER") private val converter: ConversionRegistry? = null
) {
    fun execute(definition: ToolDefinition, request: ToolRequest): ToolResponse {
        val formula = definition.formulaDefinition ?: return error(definition.id,"FORMULA_MISSING","Formula definition is missing")
        val numericInputs=linkedMapOf<String,Double>(); val normalized=linkedMapOf<String,String>()
        for(field in definition.inputSchema){
            val supplied=request.inputs[field.id]?:continue
            val raw=supplied.value.toDoubleOrNull()?:return error(definition.id,"INVALID_NUMBER","${field.label} must be numeric",field.id)
            val canonical=try{if(field.unitCategory!=null&&supplied.unit!=null&&field.canonicalUnit!=null){units.convert(raw,supplied.unit,field.canonicalUnit)?.first?:return error(definition.id,"UNIT_ERROR","Incompatible or unknown units for ${field.label}",field.id)}else raw}catch(e:Exception){return error(definition.id,"UNIT_ERROR",e.message?:"Invalid unit",field.id)}
            if(!canonical.isFinite())return error(definition.id,"NON_FINITE_INPUT","${field.label} must be finite",field.id)
            if(!field.allowNegative&&canonical<0.0)return error(definition.id,"NEGATIVE_NOT_ALLOWED","${field.label} must be non-negative",field.id)
            if(field.min!=null&&canonical<field.min)return error(definition.id,"BELOW_MINIMUM","${field.label} must be at least ${field.min}",field.id)
            if(field.max!=null&&canonical>field.max)return error(definition.id,"ABOVE_MAXIMUM","${field.label} must be at most ${field.max}",field.id)
            numericInputs[field.id]=canonical; normalized[field.id]=NumericFormat.stable(canonical)
        }
        val declared=(formula.solveRules.keys+formula.solveBranches.keys).toSet()
        val unknown=request.selectedUnknown?.also{if(it !in declared)return error(definition.id,"UNSUPPORTED_UNKNOWN","Cannot solve this formula for $it",it)}?:run{val m=definition.inputSchema.map{it.id}.filter{it !in numericInputs&&it in declared};if(m.size!=1)return error(definition.id,"AMBIGUOUS_UNKNOWN","Select exactly one supported unknown; missing=${m.joinToString()}");m.single()}
        val expressions=formula.expressionsFor(unknown);if(expressions.isEmpty())return error(definition.id,"UNSUPPORTED_UNKNOWN","Cannot solve this formula for $unknown",unknown)
        val refs=expressions.flatMap(::referencedVariables).toSet();val missing=definition.inputSchema.map{it.id}.filter{it!=unknown&&it in refs&&it !in numericInputs};if(missing.isNotEmpty())return error(definition.id,"MISSING_REQUIRED_VALUE","Missing required values: ${missing.joinToString()}",missing.first())
        val accepted=mutableListOf<Double>();val ctx=Ctx(request.settings,numericInputs.mapValues{BigDecimal.valueOf(it.value)})
        for(expression in expressions){val c=try{ExpressionEngine().parse(expression).eval(ctx).toDouble()}catch(_:Exception){continue};if(!c.isFinite())continue;val vars=numericInputs+(unknown to c);if(!FieldDomains.accept(definition.inputSchema,vars)||!DomainRules.accept(definition.validationRules,vars))continue;if(accepted.none{equivalent(it,c,formula.numericTolerance)})accepted+=c}
        if(accepted.isEmpty())return error(definition.id,"NO_SOLUTION","No valid solution satisfies the declared formula/domain")
        val field=definition.inputSchema.firstOrNull{it.id==unknown};val suffix=field?.canonicalUnit?.let{" ${units.label(it)}"}.orEmpty()
        val numeric=accepted.map{NumericFormat.stable(it)};val display=numeric.map{it+suffix};val symbolic=formula.symbolicByTarget[unknown];val primary=symbolic?:display.first()
        return ToolResponse(definition.id,primary,mapOf(unknown to primary),normalized,mapOf("solvedFor" to unknown,"solutionCount" to display.size.toString()),exact=symbolic!=null,solutions=display,symbolic=symbolic,numericTolerance=formula.numericTolerance)
    }
    private fun referencedVariables(e:String)=Regex("[A-Za-z_][A-Za-z0-9_]*").findAll(e).map{it.value}.filterNot{it in setOf("abs","sqrt","sin","cos","tan","asin","acos","atan","exp","ln","log","log10","pi","e")}.toList()
    private fun equivalent(a:Double,b:Double,t:Double)=abs(a-b)<=t*maxOf(1.0,abs(a),abs(b))
    private fun error(id:String,code:String,msg:String,field:String?=null)=ToolResponse(id,error=StructuredError(code,msg,field))
}
private object NumericFormat{fun stable(v:Double):String{if(v==0.0)return"0";return BigDecimal.valueOf(v).setScale(12,RoundingMode.HALF_EVEN).stripTrailingZeros().toPlainString()}}
private object FieldDomains{fun accept(s:List<InputFieldDefinition>,v:Map<String,Double>)=s.all{f->val x=v[f.id]?:return@all true;x.isFinite()&&(f.allowNegative||x>=0.0)&&(f.min==null||x>=f.min)&&(f.max==null||x<=f.max)}}
private object DomainRules{fun accept(r:List<String>,v:Map<String,Double>)=r.all{rule->val c=rule.replace(" ","");when{">=" in c->cmp(c,">=",v){a,b->a>=b};"<=" in c->cmp(c,"<=",v){a,b->a<=b};"!=" in c->cmp(c,"!=",v){a,b->a!=b};">" in c->cmp(c,">",v){a,b->a>b};"<" in c->cmp(c,"<",v){a,b->a<b};else->true}};private fun cmp(r:String,o:String,v:Map<String,Double>,p:(Double,Double)->Boolean):Boolean{val x=r.split(o,limit=2);if(x.size!=2)return true;val a=v[x[0]]?:x[0].toDoubleOrNull()?:return true;val b=v[x[1]]?:x[1].toDoubleOrNull()?:return true;return p(a,b)}}
