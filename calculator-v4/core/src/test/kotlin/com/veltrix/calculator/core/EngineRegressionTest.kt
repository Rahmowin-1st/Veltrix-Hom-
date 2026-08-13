package com.veltrix.calculator.core

import kotlin.math.abs
import kotlin.math.exp
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EngineRegressionTest {
    private val engine=VeltrixCalculatorEngine()
    private val settings=EngineSettings(AngleMode.DEGREES,18)
    private fun ok(q:String)=engine.calculate(q,settings).also{assertTrue(it.isSuccess,"$q -> ${it.error}")}
    private fun near(q:String,expected:Double,tol:Double=1e-9){val r=ok(q);val actual=Regex("[-+]?\\d+(?:\\.\\d+)?(?:[Ee][-+]?\\d+)?").find(r.primary)?.value?.toDouble()?:error(r.primary);assertTrue(abs(actual-expected)<=tol*maxOf(1.0,abs(expected)),"$q: $actual != $expected")}

    @Test fun standardAndPrecision(){
        assertEquals("14",ok("2+3*4").primary);assertEquals("20",ok("(2+3)*4").primary);assertEquals("0.3",ok("0.1+0.2").primary)
        assertEquals("120",ok("25% of 480").primary);assertEquals("110",ok("100+10%").primary);assertEquals("0.00000000000000000001",ok("1e-20").primary)
        assertFalse(engine.calculate("1/0",settings).isSuccess);assertFalse(engine.calculate("2+*3",settings).isSuccess);assertFalse(engine.calculate("10001!",settings).isSuccess)
    }

    @Test fun scientific(){near("sin(30)",0.5);near("cos(60)",0.5);near("tan(45)",1.0);near("ln(e)",1.0);near("log(1000)",3.0);near("sqrt(2)^2",2.0,1e-8);assertFalse(engine.calculate("sqrt(-1)",settings).isSuccess)}

    @Test fun scientificTinyMagnitudeKeepsRelativePrecision(){
        val expected=exp(-20.0)
        val actual=ok("exp(-20)").primary.toDouble()
        assertTrue(actual>0.0,"exp(-20) must not be snapped to zero")
        assertTrue(abs(actual-expected)/expected<1e-13,"tiny scientific value lost relative precision: $actual != $expected")
    }

    @Test fun complex(){assertEquals("6 - 2i",ok("complex (2+3i)+(4-5i)").primary);assertEquals("23 + 2i",ok("complex (2+3i)*(4-5i)").primary);assertEquals("2i",ok("complex sqrt(-4)").primary);assertEquals("2 - 3i",ok("conj 2+3i").primary);assertFalse(engine.calculate("complex 1/0",settings).isSuccess)}

    @Test fun algebraAndPolynomial(){
        assertEquals("x = 6",ok("2x+7=19").primary)
        val sys=ok("x+y+z=6; 2x-y+z=3; x+2y-z=3");assertTrue(sys.primary.contains("x =")&&sys.primary.contains("z ="))
        assertTrue(ok("x^2+1=0").primary.contains("i"));assertEquals("1, 2, 3",ok("roots x^3-6x^2+11x-6").primary)
        assertFalse(engine.calculate("x*y=1; x+y=2",settings).isSuccess)
        assertFalse(engine.calculate("x+y=1; 2x+2y=2",settings).isSuccess)
    }

    @Test fun matricesAndVectors(){
        assertEquals("det = -2",ok("det [1,2;3,4]").primary);assertEquals("[6, 8; 10, 12]",ok("matrix [1,2;3,4] + [5,6;7,8]").primary)
        assertEquals("[4, 4; 10, 8]",ok("matrix [1,2;3,4] * [2,0;1,2]").primary);assertEquals("[1, 4; 2, 5; 3, 6]",ok("transpose [1,2,3;4,5,6]").primary)
        assertEquals("1",ok("rank [1,2;2,4]").primary);assertTrue(ok("solve matrix [2,1;1,-1] = [5,1]").primary.startsWith("[2,"))
        assertEquals("32",ok("dot [1,2,3] [4,5,6]").primary);assertEquals("[0, 0, 1]",ok("cross [1,0,0] [0,1,0]").primary)
        assertFalse(engine.calculate("inverse [1,2;2,4]",settings).isSuccess)
    }

    @Test fun calculusAndGraph(){
        near("derivative x^2 at 3",6.0,1e-7);near("integral x^2 from 0 to 3",9.0,1e-7)
        assertTrue(ok("differentiate x^3+sin(x)").primary.contains("cos"));assertTrue(ok("integrate 3x^2+2x+1").primary.endsWith("+ C"))
        val g=ok("graph x^2-4; x from -5 to 5");assertEquals(CalculationType.GRAPH,g.type);assertEquals("2",g.metadata["series_count"]);assertTrue(g.derived["intersections"].orEmpty().contains("f1=f2"))
    }

    @Test fun unitsEngineering(){
        near("100 km to miles",62.137119223733,1e-10);assertEquals("180.34 cm",ok("5 feet 11 inches in cm").primary);near("1 kn to n",1000.0);near("10 lb ft to n m",13.558179483314,1e-10)
        near("9.80665 m/s2 to g0",1.0);near("1 g/cm3 to kg/m3",1000.0);near("1000 ma to a",1.0);near("1 kwh to mj",3.6);near("30 mpg to l/100km",7.840486111111,1e-9)
        assertFalse(engine.calculate("1 kg to m",settings).isSuccess)
    }

    @Test fun financeStatsDatesProgrammer(){
        near("percentage change from 80 to 100",25.0);assertTrue(ok("compound interest on 1000 at 5% for 10 years monthly").primary.startsWith("1647.009"));assertTrue(ok("loan 250000 at 6.5% for 30 years").primary.startsWith("1580.17"))
        near("mean: 1,2,3,4",2.5);near("standard deviation: 2,4,4,4,5,5,7,9",2.0);assertFalse(engine.calculate("mode: 1,2,3",settings).isSuccess)
        assertEquals("30 days",ok("days between 2026-01-01 and 2026-01-31").primary);assertEquals("14 years, 4 months, 6 days",ok("age 2012-04-04 at 2026-08-10").primary)
        assertEquals("0b11111111",ok("0xFF to binary").primary);assertEquals("15",ok("0xFF & 0x0F").primary);assertFalse(engine.calculate("1 << 100",settings).isSuccess)
    }

    @Test fun randomizedArithmeticProperties(){
        val rnd=Random(123456)
        repeat(500){
            val a=rnd.nextInt(-10000,10001);val b=rnd.nextInt(-10000,10001);val c=rnd.nextInt(-100,101)
            assertEquals((a.toLong()+b).toString(),ok("$a+$b").primary)
            assertEquals((a.toLong()-b).toString(),ok("$a-$b").primary)
            assertEquals((a.toLong()*c).toString(),ok("$a*$c").primary)
            if(b!=0){val r=ok("($a/$b)*$b");val v=r.primary.toDouble();assertTrue(abs(v-a)<1e-10*maxOf(1,abs(a)))}
        }
    }

    @Test fun randomizedMatrixInverseProperty(){
        val rnd=Random(77)
        repeat(80){
            var a:Int;var b:Int;var c:Int;var d:Int
            do{a=rnd.nextInt(-8,9);b=rnd.nextInt(-8,9);c=rnd.nextInt(-8,9);d=rnd.nextInt(-8,9)}while(a*d-b*c==0)
            val inv=ok("inverse [$a,$b;$c,$d]");assertTrue(inv.primary.startsWith("["))
            assertEquals((a*d-b*c).toString(),ok("det [$a,$b;$c,$d]").primary.removePrefix("det = "))
        }
    }
}
