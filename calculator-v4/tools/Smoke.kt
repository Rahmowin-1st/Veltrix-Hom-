import com.veltrix.calculator.core.*

fun main(){
    val e=VeltrixCalculatorEngine()
    val s=EngineSettings(AngleMode.DEGREES,18)
    val cases=listOf(
        "2+3*4" to "14",
        "(2+3)*4" to "20",
        "0.1+0.2" to "0.3",
        "25% of 480" to "120",
        "100+10%" to "110",
        "sin(30)" to "0.5",
        "sqrt(81)+3!" to "15",
        "2x+7=19" to "x = 6",
        "2x+y=5; x-y=1" to "x = 2, y = 1",
        "100 km to miles" to "62.137119223733",
        "5 feet 11 inches in cm" to "180.34 cm",
        "0 celsius to fahrenheit" to "32 °F",
        "det [1,2;3,4]" to "det = -2",
        "dot [1,2,3] [4,5,6]" to "32",
        "derivative x^2 at 3" to "6",
        "integral x^2 from 0 to 3" to "9",
        "sum x x=1..10" to "55",
        "0xFF to binary" to "0b11111111",
        "0xFF & 0x0F" to "15",
        "mean: 1,2,3,4" to "2.5",
        "circle 5" to "78.539",
        "days between 2026-01-01 and 2026-01-31" to "30 days"
    )
    var failed=0
    for((input,expected) in cases){
        val r=e.calculate(input,s)
        val ok=r.isSuccess && (r.primary==expected || r.primary.startsWith(expected))
        println("${if(ok) "OK" else "FAIL"} | $input => ${r.primary} ${r.error ?: ""}")
        if(!ok) failed++
    }
    val bad=listOf("1/0","sqrt(-1)","2+*3","10001!")
    for(input in bad){val r=e.calculate(input,s);val ok=!r.isSuccess;println("${if(ok)"OK" else "FAIL"} | guard $input => ${r.error}");if(!ok)failed++}
    val cur=e.calculate("100 USD to EUR",s);val okCur=cur.requiresNetwork&&cur.type==CalculationType.CURRENCY;println("${if(okCur)"OK" else "FAIL"} | currency externalized");if(!okCur)failed++
    check(failed==0){"$failed smoke checks failed"}
    println("ALL ${cases.size+bad.size+1} SMOKE CHECKS PASSED")
}
