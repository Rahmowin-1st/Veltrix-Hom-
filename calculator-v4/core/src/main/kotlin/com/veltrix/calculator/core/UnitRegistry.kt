package com.veltrix.calculator.core

import kotlin.math.abs

internal data class UnitDef(
    val id:String,
    val category:String,
    val aliases:Set<String>,
    val toBase:(Double)->Double,
    val fromBase:(Double)->Double
)

internal class UnitRegistry {
    private val units = mutableListOf<UnitDef>()
    private val alias = mutableMapOf<String,UnitDef>()

    init {
        fun linear(id:String,cat:String,factor:Double,vararg names:String)=add(UnitDef(id,cat,(setOf(id)+names).map(::norm).toSet(),{it*factor},{it/factor}))
        fun affine(id:String,cat:String,to:(Double)->Double,from:(Double)->Double,vararg names:String)=add(UnitDef(id,cat,(setOf(id)+names).map(::norm).toSet(),to,from))
        linear("m","length",1.0,"meter","meters","metre","metres")
        linear("km","length",1000.0,"kilometer","kilometers","kilometre","kilometres")
        linear("cm","length",0.01,"centimeter","centimeters")
        linear("mm","length",0.001,"millimeter","millimeters")
        linear("um","length",1e-6,"µm","micrometer","micrometers")
        linear("nm","length",1e-9,"nanometer","nanometers")
        linear("mi","length",1609.344,"mile","miles")
        linear("yd","length",0.9144,"yard","yards")
        linear("ft","length",0.3048,"foot","feet")
        linear("in","length",0.0254,"inch","inches")
        linear("nmi","length",1852.0,"nautical mile","nautical miles")

        linear("m2","area",1.0,"m^2","m²","sqm","square meter","square meters")
        linear("km2","area",1e6,"km^2","km²","square kilometer","square kilometers")
        linear("cm2","area",1e-4,"cm^2","cm²")
        linear("mm2","area",1e-6,"mm^2","mm²")
        linear("ha","area",10000.0,"hectare","hectares")
        linear("acre","area",4046.8564224,"acres")
        linear("ft2","area",0.09290304,"ft^2","ft²","square feet","square foot")
        linear("in2","area",0.00064516,"in^2","in²","square inch","square inches")
        linear("mi2","area",2_589_988.110336,"mi^2","mi²","square mile","square miles")

        linear("m3","volume",1.0,"m^3","m³","cubic meter","cubic meters")
        linear("l","volume",0.001,"liter","liters","litre","litres")
        linear("ml","volume",1e-6,"milliliter","milliliters")
        linear("cm3","volume",1e-6,"cm^3","cm³","cc")
        linear("ft3","volume",0.028316846592,"ft^3","ft³","cubic foot","cubic feet")
        linear("in3","volume",0.000016387064,"in^3","in³","cubic inch","cubic inches")
        linear("gal_us","volume",0.003785411784,"us gallon","us gallons","gallon","gallons")
        linear("qt_us","volume",0.000946352946,"us quart","us quarts","quart","quarts")

        linear("kg","mass",1.0,"kilogram","kilograms")
        linear("g","mass",0.001,"gram","grams")
        linear("mg","mass",1e-6,"milligram","milligrams")
        linear("t","mass",1000.0,"tonne","tonnes","metric ton","metric tons")
        linear("lb","mass",0.45359237,"lbs","pound","pounds")
        linear("oz","mass",0.028349523125,"ounce","ounces")

        affine("celsius","temperature",{it+273.15},{it-273.15},"c","°c","degc")
        affine("fahrenheit","temperature",{(it+459.67)*5.0/9.0},{it*9.0/5.0-459.67},"f","°f","degf")
        affine("kelvin","temperature",{it},{it},"k")

        linear("m/s","speed",1.0,"mps","meter per second","meters per second")
        linear("km/h","speed",1000.0/3600.0,"kph","kmph")
        linear("mph","speed",0.44704,"mile per hour","miles per hour")
        linear("knot","speed",0.514444444444,"knots","kt")
        linear("ft/s","speed",0.3048,"fps")

        linear("s","time",1.0,"sec","second","seconds")
        linear("ms","time",0.001,"millisecond","milliseconds")
        linear("min","time",60.0,"minute","minutes")
        linear("h","time",3600.0,"hr","hour","hours")
        linear("day","time",86400.0,"days","d")
        linear("week","time",604800.0,"weeks","wk")

        linear("pa","pressure",1.0,"pascal","pascals")
        linear("kpa","pressure",1000.0,"kilopascal","kilopascals")
        linear("mpa","pressure",1e6,"megapascal","megapascals")
        linear("bar","pressure",100000.0)
        linear("atm","pressure",101325.0,"atmosphere","atmospheres")
        linear("psi","pressure",6894.757293168,"pounds per square inch")
        linear("mmhg","pressure",133.322387415,"torr")

        linear("j","energy",1.0,"joule","joules")
        linear("kj","energy",1000.0,"kilojoule","kilojoules")
        linear("mj","energy",1e6,"megajoule","megajoules")
        linear("wh","energy",3600.0,"watt hour","watt hours")
        linear("kwh","energy",3_600_000.0,"kilowatt hour","kilowatt hours")
        linear("cal","energy",4.184,"calorie","calories")
        linear("kcal","energy",4184.0,"kilocalorie","kilocalories")
        linear("btu","energy",1055.05585262)

        linear("w","power",1.0,"watt","watts")
        linear("kw","power",1000.0,"kilowatt","kilowatts")
        linear("mw_power","power",1e6,"megawatt","megawatts")
        linear("hp","power",745.6998715822702,"horsepower")

        linear("n","force",1.0,"newton","newtons")
        linear("kn","force",1000.0,"kilonewton","kilonewtons")
        linear("dyn","force",1e-5,"dyne","dynes")
        linear("lbf","force",4.4482216152605,"pound force","pounds force")
        linear("kgf","force",9.80665,"kilogram force")

        linear("rad","angle",1.0,"radian","radians")
        linear("deg","angle",Math.PI/180.0,"degree","degrees","°")
        linear("grad","angle",Math.PI/200.0,"gon","gradians")

        linear("hz","frequency",1.0,"hertz")
        linear("khz","frequency",1000.0,"kilohertz")
        linear("mhz","frequency",1e6,"megahertz")
        linear("ghz","frequency",1e9,"gigahertz")
        linear("rpm","frequency",1.0/60.0,"revolutions per minute")

        linear("byte","data",1.0,"b","bytes")
        linear("kb","data",1024.0,"kilobyte","kilobytes")
        linear("mb","data",1024.0*1024.0,"megabyte","megabytes")
        linear("gb","data",1024.0*1024.0*1024.0,"gigabyte","gigabytes")
        linear("tb","data",1024.0*1024.0*1024.0*1024.0,"terabyte","terabytes")
        linear("bit","data",0.125,"bits")
        linear("kbit","data",125.0,"kilobit","kilobits")
        linear("mbit","data",125000.0,"megabit","megabits")

        linear("kg/m3","density",1.0,"kg/m^3","kg/m³")
        linear("g/cm3","density",1000.0,"g/cm^3","g/cm³")
        linear("lb/ft3","density",16.01846337396,"lb/ft^3","lb/ft³")

        linear("m/s2","acceleration",1.0,"m/s^2","m/s²")
        linear("ft/s2","acceleration",0.3048,"ft/s^2","ft/s²")
        linear("g0","acceleration",9.80665,"standard gravity","gravity")
        linear("gal_acc","acceleration",0.01,"gal")

        linear("nm_torque","torque",1.0,"n m","n*m","newton meter","newton meters")
        linear("knm","torque",1000.0,"kn m","kilonewton meter")
        linear("lbft","torque",1.3558179483314,"lb ft","lbf ft","pound foot")
        linear("lbin","torque",0.1129848290276167,"lb in","lbf in","pound inch")

        linear("a","current",1.0,"amp","amps","ampere","amperes")
        linear("ma","current",0.001,"milliamp","milliamps")
        linear("ua","current",1e-6,"µa","microamp","microamps")
        linear("ka","current",1000.0,"kiloamp")
        linear("v","voltage",1.0,"volt","volts")
        linear("mv","voltage",0.001,"millivolt","millivolts")
        linear("kv","voltage",1000.0,"kilovolt","kilovolts")
        linear("ohm","resistance",1.0,"Ω","ohms")
        linear("kohm","resistance",1000.0,"kΩ","kiloohm","kiloohms")
        linear("mohm","resistance",1e6,"mΩ_big","megaohm","megaohms")
        linear("coulomb","charge",1.0,"coulombs","c_charge")
        linear("ah","charge",3600.0,"amp hour","amp hours")
        linear("mah","charge",3.6,"milliamp hour","milliamp hours")
        linear("farad","capacitance",1.0,"farads","f_cap")
        linear("uf","capacitance",1e-6,"µf","microfarad","microfarads")
        linear("nf","capacitance",1e-9,"nanofarad","nanofarads")
        linear("pf","capacitance",1e-12,"picofarad","picofarads")
        linear("henry","inductance",1.0,"henries","h_ind")
        linear("mh_ind","inductance",0.001,"millihenry","millihenries")
        linear("siemens","conductance",1.0,"s_conductance")
        linear("ms_conductance","conductance",0.001,"millisiemens")
    }

    private fun add(u:UnitDef){units+=u;u.aliases.forEach{alias[it]=u}}
    private fun norm(s:String)=s.trim().lowercase().replace("²","^2").replace("³","^3").replace(Regex("\\s+")," ")

    fun convert(value:Double, fromRaw:String, toRaw:String):Triple<Double,UnitDef,UnitDef>? {
        val f=alias[norm(fromRaw)]?:return fuel(value,fromRaw,toRaw)
        val t=alias[norm(toRaw)]?:return null
        if(f.category!=t.category)return null
        val base=f.toBase(value);if(!base.isFinite())throw CalcEx("DOMAIN","Conversion produced a non-finite value")
        val out=t.fromBase(base);if(!out.isFinite())throw CalcEx("DOMAIN","Conversion produced a non-finite value")
        return Triple(out,f,t)
    }

    private fun fuel(value:Double,fromRaw:String,toRaw:String):Triple<Double,UnitDef,UnitDef>? {
        val from=norm(fromRaw);val to=norm(toRaw)
        val ids=mapOf("l/100km" to "l/100km","l per 100 km" to "l/100km","km/l" to "km/l","kpl" to "km/l","mpg" to "mpg_us","mpg us" to "mpg_us","mpg_us" to "mpg_us","mpg uk" to "mpg_uk","mpg_uk" to "mpg_uk")
        val f=ids[from]?:return null;val t=ids[to]?:return null
        if(value<=0)throw CalcEx("DOMAIN","Fuel economy values must be positive")
        val kpl=when(f){"km/l"->value;"l/100km"->100.0/value;"mpg_us"->value*0.425143707430272;else->value*0.354006189934647}
        val out=when(t){"km/l"->kpl;"l/100km"->100.0/kpl;"mpg_us"->kpl/0.425143707430272;else->kpl/0.354006189934647}
        val fd=UnitDef(f,"fuel economy",setOf(f),{it},{it});val td=UnitDef(t,"fuel economy",setOf(t),{it},{it})
        return Triple(out,fd,td)
    }

    fun categories():Map<String,List<String>> = units.groupBy{it.category}.mapValues{(_,v)->v.map{it.id}.distinct().sorted()}
    fun label(id:String)=when(id){"celsius"->"°C";"fahrenheit"->"°F";"kelvin"->"K";"deg"->"°";"byte"->"B";"nm_torque"->"N·m";"mw_power"->"MW";"mohm"->"MΩ";else->id}
}
