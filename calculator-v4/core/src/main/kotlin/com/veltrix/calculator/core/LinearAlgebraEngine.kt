package com.veltrix.calculator.core

import java.math.BigDecimal
import kotlin.math.abs

internal class LinearAlgebraEngine {
    fun tryMatrix(input: String, settings: EngineSettings): CalculationResult? {
        val s = input.trim()
        Regex("(?i)^(det|determinant|inverse|transpose|rank)\\s*(\\[[^]]+])$").matchEntire(s)?.let { m ->
            val a = parseMatrixToken(m.groupValues[2])
            return when (m.groupValues[1].lowercase()) {
                "det", "determinant" -> {
                    if (a.size != a[0].size) CalculationResult.fail(input, CalculationType.MATRIX, "SHAPE", "Determinant requires a square matrix")
                    else CalculationResult(input, CalculationType.MATRIX, "det = ${fmt(determinant(a), settings)}")
                }
                "inverse" -> {
                    if (a.size != a[0].size) CalculationResult.fail(input, CalculationType.MATRIX, "SHAPE", "Inverse requires a square matrix")
                    else inverse(a)?.let { CalculationResult(input, CalculationType.MATRIX, format(it, settings)) }
                        ?: CalculationResult.fail(input, CalculationType.MATRIX, "SINGULAR", "Matrix has no inverse")
                }
                "transpose" -> CalculationResult(input, CalculationType.MATRIX, format(transpose(a), settings))
                else -> CalculationResult(input, CalculationType.MATRIX, rank(a).toString(), derived = mapOf("rank" to rank(a).toString()))
            }
        }
        Regex("(?i)^matrix\\s+(\\[[^]]+])\\s*([+\\-*])\\s*(\\[[^]]+])$").matchEntire(s)?.let { m ->
            val a = parseMatrixToken(m.groupValues[1]); val b = parseMatrixToken(m.groupValues[3])
            val out = when (m.groupValues[2]) { "+" -> add(a,b); "-" -> sub(a,b); else -> multiply(a,b) }
                ?: return CalculationResult.fail(input, CalculationType.MATRIX, "SHAPE", "Matrix dimensions are incompatible")
            return CalculationResult(input, CalculationType.MATRIX, format(out, settings))
        }
        Regex("(?i)^matrix\\s+(\\[[^]]+])\\s*\\*\\s*([+-]?[0-9.]+)$").matchEntire(s)?.let { m ->
            val a=parseMatrixToken(m.groupValues[1]); val k=m.groupValues[2].toDouble()
            return CalculationResult(input, CalculationType.MATRIX, format(Array(a.size){r->DoubleArray(a[0].size){c->a[r][c]*k}}, settings))
        }
        Regex("(?i)^([+-]?[0-9.]+)\\s*\\*\\s*matrix\\s+(\\[[^]]+])$").matchEntire(s)?.let { m ->
            val k=m.groupValues[1].toDouble(); val a=parseMatrixToken(m.groupValues[2])
            return CalculationResult(input, CalculationType.MATRIX, format(Array(a.size){r->DoubleArray(a[0].size){c->a[r][c]*k}}, settings))
        }
        Regex("(?i)^solve\\s+matrix\\s+(\\[[^]]+])\\s*(?:=|with)\\s*\\[([^]]+)]$").matchEntire(s)?.let { m ->
            val a=parseMatrixToken(m.groupValues[1]); val b=m.groupValues[2].split(',').map{it.trim().toDouble()}.toDoubleArray()
            if(a.size!=b.size) return CalculationResult.fail(input,CalculationType.MATRIX,"SHAPE","Right-hand vector length must match matrix rows")
            return when(val sol=solve(a,b)){
                is LinearSolution.Unique -> CalculationResult(input,CalculationType.MATRIX,sol.values.joinToString(", ","[","]"){fmt(it,settings)})
                LinearSolution.Inconsistent -> CalculationResult.fail(input,CalculationType.MATRIX,"INCONSISTENT","Linear system has no solution")
                LinearSolution.Infinite -> CalculationResult.fail(input,CalculationType.MATRIX,"UNDERDETERMINED","Linear system has infinitely many solutions")
            }
        }
        return null
    }

    fun solveEquations(input:String, eqs:List<String>, expression:ExpressionEngine, settings:EngineSettings):CalculationResult {
        val pairs=eqs.map { e ->
            val p=e.split('=',limit=2); if(p.size!=2) return CalculationResult.fail(input,CalculationType.ALGEBRA,"SYSTEM","Every system row must contain =")
            expression.parse(p[0]) to expression.parse(p[1])
        }
        val vars=pairs.flatMap{it.first.vars()+it.second.vars()}.distinct().sorted()
        if(vars.isEmpty()) return CalculationResult.fail(input,CalculationType.ALGEBRA,"SYSTEM","No variables found")
        val a=Array(pairs.size){DoubleArray(vars.size)}; val b=DoubleArray(pairs.size)
        fun value(pair:Pair<Node,Node>, values:DoubleArray):Double {
            val map=vars.indices.associate { vars[it] to BigDecimal.valueOf(values[it]) }
            return pair.first.eval(Ctx(settings,map)).toDouble()-pair.second.eval(Ctx(settings,map)).toDouble()
        }
        val zero=DoubleArray(vars.size)
        for(r in pairs.indices){
            val c=value(pairs[r],zero); b[r]=-c
            for(j in vars.indices){val basis=DoubleArray(vars.size);basis[j]=1.0;a[r][j]=value(pairs[r],basis)-c}
            val probe=DoubleArray(vars.size){j-> when(j%4){0->2.0;1->-1.5;2->0.5;else->3.0}}
            val expected=c+vars.indices.sumOf{j->a[r][j]*probe[j]}; val actual=value(pairs[r],probe)
            if(!actual.isFinite()||abs(actual-expected)>1e-8*maxOf(1.0,abs(actual),abs(expected)))
                return CalculationResult.fail(input,CalculationType.ALGEBRA,"NONLINEAR_SYSTEM","System solver accepts linear equations only")
        }
        return when(val sol=solve(a,b)){
            is LinearSolution.Unique -> CalculationResult(input,CalculationType.ALGEBRA,vars.indices.joinToString(", "){"${vars[it]} = ${fmt(sol.values[it],settings)}"},derived=vars.indices.associate{vars[it] to fmt(sol.values[it],settings)},steps=listOf("Extracted ${a.size} linear equations in ${vars.size} variables","Solved with pivoted row reduction"))
            LinearSolution.Inconsistent -> CalculationResult.fail(input,CalculationType.ALGEBRA,"INCONSISTENT","Linear system has no solution")
            LinearSolution.Infinite -> CalculationResult.fail(input,CalculationType.ALGEBRA,"UNDERDETERMINED","Linear system has infinitely many solutions")
        }
    }

    private sealed interface LinearSolution { data class Unique(val values:DoubleArray):LinearSolution; data object Inconsistent:LinearSolution; data object Infinite:LinearSolution }
    private fun solve(a:Array<DoubleArray>, b:DoubleArray):LinearSolution {
        if(a.isEmpty()||a[0].isEmpty()) return LinearSolution.Infinite
        val m=a.size; val n=a[0].size
        val x=Array(m){r->DoubleArray(n+1){c->if(c<n)a[r][c] else b[r]}}
        var row=0; val pivots=IntArray(minOf(m,n)){ -1 }; var pc=0
        for(col in 0 until n){
            var p=row
            for(r in row until m) if(abs(x[r][col])>abs(x[p][col])) p=r
            val scale=(row until m).maxOfOrNull{r->x[r].take(n).maxOf{abs(it)}}?:1.0
            if(abs(x[p][col])<=1e-12*maxOf(1.0,scale)) continue
            val tmp=x[row];x[row]=x[p];x[p]=tmp
            val q=x[row][col];for(c in col..n)x[row][c]/=q
            for(r in 0 until m) if(r!=row){val f=x[r][col];if(abs(f)>1e-15)for(c in col..n)x[r][c]-=f*x[row][c]}
            pivots[pc++]=col; row++; if(row==m)break
        }
        for(r in 0 until m){val allZero=(0 until n).all{abs(x[r][it])<1e-10};if(allZero&&abs(x[r][n])>1e-9)return LinearSolution.Inconsistent}
        if(pc<n)return LinearSolution.Infinite
        val out=DoubleArray(n);for(r in 0 until pc){val c=pivots[r];if(c>=0)out[c]=x[r][n]};return LinearSolution.Unique(out)
    }

    private fun parseMatrixToken(token:String):Array<DoubleArray>{
        val body=token.trim().removePrefix("[").removeSuffix("]")
        val rows=body.split(';').map{row->row.split(',').map{it.trim().toDoubleOrNull()?:throw CalcEx("NUMBER","Invalid matrix number")}.toDoubleArray()}
        if(rows.isEmpty()||rows[0].isEmpty()||rows.any{it.size!=rows[0].size})throw CalcEx("SHAPE","Matrix rows must have equal length")
        if(rows.size>20||rows[0].size>20)throw CalcEx("TOO_LARGE","Matrix is limited to 20×20 for interactive calculations")
        return rows.toTypedArray()
    }
    private fun add(a:Array<DoubleArray>,b:Array<DoubleArray>)=if(a.size==b.size&&a[0].size==b[0].size)Array(a.size){r->DoubleArray(a[0].size){c->a[r][c]+b[r][c]}}else null
    private fun sub(a:Array<DoubleArray>,b:Array<DoubleArray>)=if(a.size==b.size&&a[0].size==b[0].size)Array(a.size){r->DoubleArray(a[0].size){c->a[r][c]-b[r][c]}}else null
    private fun multiply(a:Array<DoubleArray>,b:Array<DoubleArray>):Array<DoubleArray>?{if(a[0].size!=b.size)return null;return Array(a.size){r->DoubleArray(b[0].size){c->a[0].indices.sumOf{k->a[r][k]*b[k][c]}}}}
    private fun transpose(a:Array<DoubleArray>)=Array(a[0].size){c->DoubleArray(a.size){r->a[r][c]}}
    private fun determinant(a:Array<DoubleArray>):Double{val n=a.size;val x=Array(n){a[it].copyOf()};var sign=1.0;var d=1.0;for(i in 0 until n){var p=i;for(r in i until n)if(abs(x[r][i])>abs(x[p][i]))p=r;if(abs(x[p][i])<1e-14)return 0.0;if(p!=i){val t=x[i];x[i]=x[p];x[p]=t;sign=-sign};val q=x[i][i];d*=q;for(r in i+1 until n){val f=x[r][i]/q;for(c in i+1 until n)x[r][c]-=f*x[i][c]}};return d*sign}
    private fun inverse(a:Array<DoubleArray>):Array<DoubleArray>?{val n=a.size;val x=Array(n){r->DoubleArray(2*n){c->when{c<n->a[r][c];c-n==r->1.0;else->0.0}}};for(i in 0 until n){var p=i;for(r in i until n)if(abs(x[r][i])>abs(x[p][i]))p=r;if(abs(x[p][i])<1e-13)return null;val t=x[i];x[i]=x[p];x[p]=t;val q=x[i][i];for(c in 0 until 2*n)x[i][c]/=q;for(r in 0 until n)if(r!=i){val f=x[r][i];for(c in 0 until 2*n)x[r][c]-=f*x[i][c]}};return Array(n){r->DoubleArray(n){c->x[r][c+n]}}}
    private fun rank(a:Array<DoubleArray>):Int{val b=DoubleArray(a.size);return when(val s=solve(a,b)){is LinearSolution.Unique->a[0].size;else->{val x=Array(a.size){a[it].copyOf()};var row=0;for(col in a[0].indices){var p=row;for(r in row until a.size)if(abs(x[r][col])>abs(x[p][col]))p=r;if(abs(x[p][col])<1e-12)continue;val t=x[row];x[row]=x[p];x[p]=t;val q=x[row][col];for(c in col until a[0].size)x[row][c]/=q;for(r in row+1 until a.size){val f=x[r][col];for(c in col until a[0].size)x[r][c]-=f*x[row][c]};row++;if(row==a.size)break};row}}}
    private fun format(a:Array<DoubleArray>,st:EngineSettings)=a.joinToString("; ","[","]"){r->r.joinToString(", "){fmt(it,st)}}
    private fun fmt(v:Double,st:EngineSettings)=ComplexEngine.formatDouble(v,st)
}
