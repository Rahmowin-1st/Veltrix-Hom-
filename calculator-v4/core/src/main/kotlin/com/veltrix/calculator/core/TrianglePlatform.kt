package com.veltrix.calculator.core

import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class TriangleSolution(val a:Double,val b:Double,val c:Double,val angleA:Double,val angleB:Double,val angleC:Double)
data class TriangleSolveResult(val solutions:List<TriangleSolution>,val ambiguous:Boolean)

/** Deterministic SSS/SAS/ASA/AAS/SSA triangle solver with honest ambiguity reporting. Angles are degrees. */
object TrianglePlatform {
    fun solve(a:Double?,b:Double?,c:Double?,A:Double?,B:Double?,C:Double?):TriangleSolveResult {
        val s=doubleArrayOf(a?:Double.NaN,b?:Double.NaN,c?:Double.NaN)
        val ang=doubleArrayOf(A?.let(::rad)?:Double.NaN,B?.let(::rad)?:Double.NaN,C?.let(::rad)?:Double.NaN)
        s.filter(Double::isFinite).forEach{if(it<=0)throw CalcEx("DOMAIN","Triangle sides must be greater than zero")}
        ang.filter(Double::isFinite).forEach{if(it<=0||it>=PI)throw CalcEx("DOMAIN","Triangle angles must be between 0 and 180 degrees")}
        if(ang.count(Double::isFinite)>=2){val missing=(0..2).firstOrNull{!ang[it].isFinite()};if(missing!=null){ang[missing]=PI-ang.filter(Double::isFinite).sum();if(ang[missing]<=0)throw CalcEx("IMPOSSIBLE_TRIANGLE","Triangle angles must sum to 180 degrees")}}
        if(s.all(Double::isFinite)) return TriangleSolveResult(listOf(fromSides(s[0],s[1],s[2])),false)
        if(ang.all(Double::isFinite)&&s.any(Double::isFinite)) return TriangleSolveResult(listOf(fromAnglesAndSide(s,ang)),false)

        val knownSides=(0..2).filter{s[it].isFinite()}
        if(knownSides.size==2){
            val missingSide=(0..2).first{!s[it].isFinite()}
            if(ang[missingSide].isFinite()) { // SAS: included angle is opposite missing side
                val i=knownSides[0];val j=knownSides[1];val k=missingSide
                s[k]=sqrt(s[i]*s[i]+s[j]*s[j]-2*s[i]*s[j]*cos(ang[k]))
                return TriangleSolveResult(listOf(fromSides(s[0],s[1],s[2])),false)
            }
            val knownAngleIndex=(0..2).firstOrNull{ang[it].isFinite()&&s[it].isFinite()}
            if(knownAngleIndex!=null){ // SSA, possibly two valid triangles
                val otherSideIndex=knownSides.first{it!=knownAngleIndex}
                val x=s[otherSideIndex]*sin(ang[knownAngleIndex])/s[knownAngleIndex]
                if(x>1+1e-12)throw CalcEx("IMPOSSIBLE_TRIANGLE","Known side/angle values cannot form a triangle")
                val base=asin(x.coerceIn(-1.0,1.0));val candidateAngles=listOf(base,PI-base).distinctBy{(it*1e12).toLong()}
                val out=candidateAngles.mapNotNull{otherAngle->
                    val third=PI-ang[knownAngleIndex]-otherAngle
                    if(third<=1e-12)return@mapNotNull null
                    val aa=ang.copyOf();aa[otherSideIndex]=otherAngle;aa[(0..2).first{it!=knownAngleIndex&&it!=otherSideIndex}]=third
                    runCatching{fromAnglesAndSide(s,aa)}.getOrNull()
                }.distinctBy{listOf(it.a,it.b,it.c).joinToString(","){v->"%.10f".format(java.util.Locale.US,v)}}
                if(out.isEmpty())throw CalcEx("IMPOSSIBLE_TRIANGLE","Known side/angle values cannot form a triangle")
                return TriangleSolveResult(out,out.size>1)
            }
        }
        throw CalcEx("INSUFFICIENT_DATA","Provide SSS, SAS, ASA/AAS, or a valid SSA set")
    }

    private fun fromSides(a:Double,b:Double,c:Double):TriangleSolution{
        if(a+b<=c||a+c<=b||b+c<=a)throw CalcEx("IMPOSSIBLE_TRIANGLE","Triangle inequality is not satisfied")
        val A=acos(((b*b+c*c-a*a)/(2*b*c)).coerceIn(-1.0,1.0));val B=acos(((a*a+c*c-b*b)/(2*a*c)).coerceIn(-1.0,1.0));val C=PI-A-B
        return TriangleSolution(a,b,c,deg(A),deg(B),deg(C))
    }
    private fun fromAnglesAndSide(sides:DoubleArray,angles:DoubleArray):TriangleSolution{
        if(angles.any{!it.isFinite()||it<=0}||kotlin.math.abs(angles.sum()-PI)>1e-8)throw CalcEx("IMPOSSIBLE_TRIANGLE","Triangle angles must sum to 180 degrees")
        val known=(0..2).firstOrNull{sides[it].isFinite()}?:throw CalcEx("INSUFFICIENT_DATA","At least one side is required")
        val scale=sides[known]/sin(angles[known]);val s=DoubleArray(3){i->if(sides[i].isFinite())sides[i] else scale*sin(angles[i])}
        val result=TriangleSolution(s[0],s[1],s[2],deg(angles[0]),deg(angles[1]),deg(angles[2]))
        val check=fromSides(result.a,result.b,result.c)
        if(kotlin.math.abs(check.angleA-result.angleA)>1e-6||kotlin.math.abs(check.angleB-result.angleB)>1e-6)throw CalcEx("INCONSISTENT_DATA","Known sides and angles are inconsistent")
        return result
    }
    private fun rad(v:Double)=v*PI/180.0
    private fun deg(v:Double)=v*180.0/PI
}
