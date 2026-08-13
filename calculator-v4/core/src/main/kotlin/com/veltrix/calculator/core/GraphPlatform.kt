package com.veltrix.calculator.core

import kotlin.math.abs
import kotlin.math.sqrt

data class ConicAnalysis(
    val family: String,
    val expression: String,
    val derived: Map<String, String>,
    val asymptotes: List<String> = emptyList(),
    val foci: List<String> = emptyList(),
    val viewport: GraphViewport = GraphViewport(-10.0, 10.0, -10.0, 10.0)
)

data class SafeGraphSegment(val points: List<GraphPoint>)
data class SafeGraphSeries(val expression: String, val segments: List<SafeGraphSegment>, val roots: List<Double>, val localExtrema: List<GraphExtremum>)
data class SafeGraphBundle(val variable: String, val viewport: GraphViewport, val series: List<SafeGraphSeries>, val intersections: List<GraphIntersection>, val sampleCount: Int)

class GraphPlatform(private val analyzer: GraphAnalyzer = GraphAnalyzer()) {
    fun functions(expressions: List<String>, viewport: GraphViewport, settings: EngineSettings = EngineSettings(), samples: Int = 801): SafeGraphBundle {
        if (expressions.size !in 1..12) throw CalcEx("GRAPH_SERIES", "Graph supports 1..12 simultaneous functions")
        val raw = analyzer.analyze(expressions, viewport.minX, viewport.maxX, settings, samples.coerceIn(101, 3001))
        val safe = raw.series.map { s ->
            val segments = mutableListOf<SafeGraphSegment>(); var current = mutableListOf<GraphPoint>()
            val ySpan = viewport.maxY - viewport.minY
            fun flush() { if (current.size >= 2) segments += SafeGraphSegment(current.toList()); current = mutableListOf() }
            for (i in s.points.indices) {
                val p = s.points[i]
                val withinGuard = p.y.isFinite() && abs(p.y) <= maxOf(1e12, ySpan * 1e8)
                val jump = if (i == 0) false else {
                    val prev = s.points[i - 1]
                    prev.y.isFinite() && p.y.isFinite() && abs(p.y - prev.y) > maxOf(1e6, ySpan * 50)
                }
                if (!withinGuard || jump) flush() else current += p
            }
            flush()
            SafeGraphSeries(s.expression, segments, s.roots, s.localExtrema)
        }
        return SafeGraphBundle(raw.variable, viewport, safe, raw.intersections, raw.sampleCount)
    }

    fun lineSlopeIntercept(m: Double, b: Double): ConicAnalysis {
        finite(m, b); return ConicAnalysis("line", "y = ${fmt(m)}x + ${fmt(b)}", mapOf("slope" to fmt(m), "yIntercept" to fmt(b)))
    }

    fun lineTwoPoint(x1: Double, y1: Double, x2: Double, y2: Double): ConicAnalysis {
        finite(x1,y1,x2,y2); if (abs(x2-x1)<1e-14) return ConicAnalysis("line", "x = ${fmt(x1)}", mapOf("orientation" to "vertical", "xIntercept" to fmt(x1)))
        val m=(y2-y1)/(x2-x1); val b=y1-m*x1; return lineSlopeIntercept(m,b).copy(derived = lineSlopeIntercept(m,b).derived + mapOf("point1" to "(${fmt(x1)}, ${fmt(y1)})", "point2" to "(${fmt(x2)}, ${fmt(y2)})"))
    }

    fun parabolaVertex(a: Double, h: Double, k: Double): ConicAnalysis {
        finite(a,h,k); if(abs(a)<1e-14) throw CalcEx("DEGENERATE","a must be non-zero")
        val roots = if (-k/a >= -1e-14) { val d=sqrt(maxOf(0.0,-k/a)); listOf(h-d,h+d).distinct().joinToString(", ", transform=::fmt) } else "none (real)"
        return ConicAnalysis("parabola", "y = ${fmt(a)}(x-${fmt(h)})^2+${fmt(k)}", mapOf("vertex" to "(${fmt(h)}, ${fmt(k)})", "axis" to "x = ${fmt(h)}", "opening" to if(a>0)"up" else "down", "roots" to roots, "yIntercept" to fmt(a*h*h+k)))
    }

    fun parabolaStandard(a:Double,b:Double,c:Double):ConicAnalysis{finite(a,b,c);if(abs(a)<1e-14)throw CalcEx("DEGENERATE","a must be non-zero");val h=-b/(2*a);val k=a*h*h+b*h+c;return parabolaVertex(a,h,k).copy(expression="y = ${fmt(a)}x^2 + ${fmt(b)}x + ${fmt(c)}")}

    fun circle(h:Double,k:Double,r:Double):ConicAnalysis{finite(h,k,r);if(r<=0)throw CalcEx("DOMAIN","Radius must be greater than zero");return ConicAnalysis("circle","(x-${fmt(h)})^2 + (y-${fmt(k)})^2 = ${fmt(r*r)}",mapOf("center" to "(${fmt(h)}, ${fmt(k)})","radius" to fmt(r),"domain" to "[${fmt(h-r)}, ${fmt(h+r)}]","range" to "[${fmt(k-r)}, ${fmt(k+r)}]"),viewport=autoViewport(h,k,r,r))}

    fun ellipse(h:Double,k:Double,a:Double,b:Double):ConicAnalysis{finite(h,k,a,b);if(a<=0||b<=0)throw CalcEx("DOMAIN","Semiaxes must be greater than zero");val majorHorizontal=a>=b;val major=maxOf(a,b);val minor=minOf(a,b);val c=sqrt(maxOf(0.0,major*major-minor*minor));val f=if(majorHorizontal)listOf("(${fmt(h-c)}, ${fmt(k)})","(${fmt(h+c)}, ${fmt(k)})")else listOf("(${fmt(h)}, ${fmt(k-c)})","(${fmt(h)}, ${fmt(k+c)})");return ConicAnalysis("ellipse","(x-${fmt(h)})^2/${fmt(a*a)} + (y-${fmt(k)})^2/${fmt(b*b)} = 1",mapOf("center" to "(${fmt(h)}, ${fmt(k)})","semiAxisX" to fmt(a),"semiAxisY" to fmt(b),"orientation" to if(majorHorizontal)"horizontal" else "vertical"),foci=f,viewport=autoViewport(h,k,a,b))}

    fun hyperbola(h:Double,k:Double,a:Double,b:Double,horizontal:Boolean):ConicAnalysis{finite(h,k,a,b);if(a<=0||b<=0)throw CalcEx("DOMAIN","Semiaxes must be greater than zero");val c=sqrt(a*a+b*b);val asym=if(horizontal)listOf("y-${fmt(k)} = ${fmt(b/a)}(x-${fmt(h)})","y-${fmt(k)} = ${fmt(-b/a)}(x-${fmt(h)})")else listOf("y-${fmt(k)} = ${fmt(a/b)}(x-${fmt(h)})","y-${fmt(k)} = ${fmt(-a/b)}(x-${fmt(h)})");val f=if(horizontal)listOf("(${fmt(h-c)}, ${fmt(k)})","(${fmt(h+c)}, ${fmt(k)})")else listOf("(${fmt(h)}, ${fmt(k-c)})","(${fmt(h)}, ${fmt(k+c)})");val expr=if(horizontal)"(x-${fmt(h)})^2/${fmt(a*a)} - (y-${fmt(k)})^2/${fmt(b*b)} = 1" else "(y-${fmt(k)})^2/${fmt(a*a)} - (x-${fmt(h)})^2/${fmt(b*b)} = 1";return ConicAnalysis("hyperbola",expr,mapOf("center" to "(${fmt(h)}, ${fmt(k)})","orientation" to if(horizontal)"horizontal" else "vertical"),asym,f,autoViewport(h,k,a*2,b*2))}

    private fun autoViewport(h:Double,k:Double,a:Double,b:Double)=GraphViewport(h-maxOf(2.0,a*1.4),h+maxOf(2.0,a*1.4),k-maxOf(2.0,b*1.4),k+maxOf(2.0,b*1.4))
    private fun finite(vararg x:Double){if(x.any{!it.isFinite()})throw CalcEx("NON_FINITE","Graph parameters must be finite")}
    private fun fmt(v:Double)=java.math.BigDecimal.valueOf(if(abs(v)<1e-12)0.0 else v).stripTrailingZeros().toPlainString()
}
