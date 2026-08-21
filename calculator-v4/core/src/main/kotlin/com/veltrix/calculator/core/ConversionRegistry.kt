package com.veltrix.calculator.core

import kotlin.math.PI

data class ConversionUnit(
    val id: String,
    val name: String,
    val symbol: String,
    val category: String,
    val aliases: Set<String>,
    val formula: String,
    val toBase: (Double) -> Double,
    val fromBase: (Double) -> Double
)

data class ConversionResult(
    val value: Double,
    val from: ConversionUnit,
    val to: ConversionUnit
)

class ConversionRegistry private constructor(private val units: List<ConversionUnit>) {
    private val byAlias: Map<String, List<ConversionUnit>> = buildMap {
        val tmp = linkedMapOf<String, MutableList<ConversionUnit>>()
        units.forEach { u ->
            (u.aliases + u.id + u.symbol + u.name).forEach { alias -> tmp.getOrPut(normalize(alias)) { mutableListOf() }.add(u) }
        }
        tmp.forEach { (k, v) -> put(k, v.distinctBy { it.id }) }
    }

    fun categories(): Map<String, List<ConversionUnit>> = units.groupBy { it.category }.toSortedMap()
    fun units(category: String): List<ConversionUnit> = units.filter { it.category.equals(category, true) }
    fun resolveAll(raw: String): List<ConversionUnit> = byAlias[normalize(raw)].orEmpty()
    fun resolve(raw: String): ConversionUnit? = resolveAll(raw).singleOrNull()
    fun resolveInCategory(category: String, raw: String): ConversionUnit? =
        resolveAll(raw).filter { it.category.equals(category, true) }.singleOrNull()
    fun find(raw: String): ConversionUnit? = resolve(raw)
    fun findInCategory(category: String, raw: String): ConversionUnit? = resolveInCategory(category, raw)

    fun convert(value: Double, fromRaw: String, toRaw: String): ConversionResult? {
        if (!value.isFinite()) throw CalcEx("NON_FINITE", "Conversion input must be finite")
        val fromCandidates = resolveAll(fromRaw)
        val toCandidates = resolveAll(toRaw)
        if (fromCandidates.isEmpty() || toCandidates.isEmpty()) return null
        val commonCategories = fromCandidates.map { it.category }.toSet().intersect(toCandidates.map { it.category }.toSet())
        if (commonCategories.size != 1) return null
        val category = commonCategories.single()
        val from = fromCandidates.filter { it.category == category }.singleOrNull() ?: return null
        val to = toCandidates.filter { it.category == category }.singleOrNull() ?: return null
        val base = from.toBase(value)
        val result = to.fromBase(base)
        if (!base.isFinite() || !result.isFinite()) throw CalcEx("NON_FINITE", "Conversion result is non-finite")
        return ConversionResult(result, from, to)
    }

    fun exportMetadata(): List<Map<String, String>> = units.map {
        mapOf("id" to it.id, "name" to it.name, "symbol" to it.symbol, "category" to it.category, "formula" to it.formula)
    }

    companion object {
        fun default(): ConversionRegistry {
            val u = mutableListOf<ConversionUnit>()
            fun linear(id: String, name: String, symbol: String, cat: String, factor: Double, vararg aliases: String) {
                u += ConversionUnit(id, name, symbol, cat, aliases.toSet(), "base = value × $factor", { it * factor }, { it / factor })
            }
            fun affine(id: String, name: String, symbol: String, cat: String, formula: String, to: (Double) -> Double, from: (Double) -> Double, vararg aliases: String) {
                u += ConversionUnit(id, name, symbol, cat, aliases.toSet(), formula, to, from)
            }

            // Length
            linear("m", "Meter", "m", "Length", 1.0, "meter", "meters", "metre", "metres")
            linear("km", "Kilometer", "km", "Length", 1_000.0, "kilometer", "kilometers")
            linear("cm", "Centimeter", "cm", "Length", .01, "centimeter", "centimeters")
            linear("mm", "Millimeter", "mm", "Length", .001, "millimeter", "millimeters")
            linear("um", "Micrometer", "µm", "Length", 1e-6, "micrometer", "micrometers")
            linear("nm", "Nanometer", "nm", "Length", 1e-9, "nanometer", "nanometers")
            linear("in", "Inch", "in", "Length", .0254, "inch", "inches")
            linear("ft", "Foot", "ft", "Length", .3048, "foot", "feet")
            linear("yd", "Yard", "yd", "Length", .9144, "yard", "yards")
            linear("mi", "Mile", "mi", "Length", 1609.344, "mile", "miles")
            linear("nmi", "Nautical Mile", "nmi", "Length", 1852.0, "nautical mile", "nautical miles")

            // Area
            linear("m2", "Square Meter", "m²", "Area", 1.0, "m^2", "sqm")
            linear("km2", "Square Kilometer", "km²", "Area", 1e6, "km^2")
            linear("cm2", "Square Centimeter", "cm²", "Area", 1e-4, "cm^2")
            linear("mm2", "Square Millimeter", "mm²", "Area", 1e-6, "mm^2")
            linear("ha", "Hectare", "ha", "Area", 10_000.0, "hectare", "hectares")
            linear("acre", "Acre", "acre", "Area", 4046.8564224, "acres")
            linear("ft2", "Square Foot", "ft²", "Area", .09290304, "ft^2", "square feet")
            linear("in2", "Square Inch", "in²", "Area", .00064516, "in^2")

            // Volume
            linear("m3", "Cubic Meter", "m³", "Volume", 1.0, "m^3")
            linear("l", "Liter", "L", "Volume", .001, "liter", "liters", "litre", "litres")
            linear("ml", "Milliliter", "mL", "Volume", 1e-6, "milliliter", "milliliters")
            linear("cm3", "Cubic Centimeter", "cm³", "Volume", 1e-6, "cm^3", "cc")
            linear("gal_us", "US Gallon", "gal", "Volume", .003785411784, "gallon", "gallons", "us gallon")
            linear("qt_us", "US Quart", "qt", "Volume", .000946352946, "quart", "quarts")
            linear("ft3", "Cubic Foot", "ft³", "Volume", .028316846592, "ft^3")

            // Mass
            linear("kg", "Kilogram", "kg", "Mass", 1.0, "kilogram", "kilograms")
            linear("g", "Gram", "g", "Mass", .001, "gram", "grams")
            linear("mg", "Milligram", "mg", "Mass", 1e-6, "milligram", "milligrams")
            linear("t", "Metric Tonne", "t", "Mass", 1000.0, "tonne", "tonnes", "metric ton")
            linear("lb", "Pound", "lb", "Mass", .45359237, "pound", "pounds", "lbs")
            linear("oz", "Ounce", "oz", "Mass", .028349523125, "ounce", "ounces")

            // Temperature base K
            affine("c", "Celsius", "°C", "Temperature", "K = °C + 273.15", { it + 273.15 }, { it - 273.15 }, "celsius", "°c")
            affine("f", "Fahrenheit", "°F", "Temperature", "K = (°F + 459.67) × 5/9", { (it + 459.67) * 5.0 / 9.0 }, { it * 9.0 / 5.0 - 459.67 }, "fahrenheit", "°f")
            affine("k", "Kelvin", "K", "Temperature", "base = K", { it }, { it }, "kelvin")

            // Speed
            linear("mps", "Meter per Second", "m/s", "Speed", 1.0, "m/s")
            linear("kph", "Kilometer per Hour", "km/h", "Speed", 1000.0 / 3600.0, "km/h", "kmph")
            linear("mph", "Mile per Hour", "mph", "Speed", .44704, "mile per hour")
            linear("knot", "Knot", "kn", "Speed", .514444444444, "knots")
            linear("fps", "Foot per Second", "ft/s", "Speed", .3048, "ft/s")

            // Pressure
            linear("pa", "Pascal", "Pa", "Pressure", 1.0, "pascal", "pascals")
            linear("kpa", "Kilopascal", "kPa", "Pressure", 1e3, "kilopascal")
            linear("mpa", "Megapascal", "MPa", "Pressure", 1e6, "megapascal")
            linear("bar", "Bar", "bar", "Pressure", 100000.0)
            linear("atm", "Standard Atmosphere", "atm", "Pressure", 101325.0, "atmosphere")
            linear("psi", "Pound per Square Inch", "psi", "Pressure", 6894.757293168)
            linear("mmhg", "Millimeter of Mercury", "mmHg", "Pressure", 133.322387415, "torr")

            // Power, Energy, Force, Torque
            linear("w", "Watt", "W", "Power", 1.0, "watt", "watts")
            linear("kw", "Kilowatt", "kW", "Power", 1e3, "kilowatt")
            linear("mw_power", "Megawatt", "MW", "Power", 1e6, "megawatt")
            linear("hp", "Mechanical Horsepower", "hp", "Power", 745.6998715822702, "horsepower")
            linear("j", "Joule", "J", "Energy", 1.0, "joule", "joules")
            linear("kj", "Kilojoule", "kJ", "Energy", 1e3, "kilojoule")
            linear("wh", "Watt-hour", "Wh", "Energy", 3600.0, "watt hour")
            linear("kwh", "Kilowatt-hour", "kWh", "Energy", 3_600_000.0, "kilowatt hour")
            linear("cal", "Calorie", "cal", "Energy", 4.184, "calorie")
            linear("kcal", "Kilocalorie", "kcal", "Energy", 4184.0, "kilocalorie")
            linear("btu", "British Thermal Unit", "BTU", "Energy", 1055.05585262)
            linear("n", "Newton", "N", "Force", 1.0, "newton", "newtons")
            linear("kn_force", "Kilonewton", "kN", "Force", 1e3, "kilonewton")
            linear("lbf", "Pound-force", "lbf", "Force", 4.4482216152605, "pound force")
            linear("nm_torque", "Newton-meter", "N·m", "Torque", 1.0, "n m", "newton meter")
            linear("lbft", "Pound-foot", "lb·ft", "Torque", 1.3558179483314, "lb ft", "lbf ft")
            linear("lbin", "Pound-inch", "lb·in", "Torque", .1129848290276167, "lb in")

            // Density, acceleration
            linear("kgm3", "Kilogram per Cubic Meter", "kg/m³", "Density", 1.0, "kg/m3", "kg/m^3")
            linear("gcm3", "Gram per Cubic Centimeter", "g/cm³", "Density", 1000.0, "g/cm3", "g/cm^3")
            linear("lbft3", "Pound per Cubic Foot", "lb/ft³", "Density", 16.01846337396, "lb/ft3")
            linear("mps2", "Meter per Second Squared", "m/s²", "Acceleration", 1.0, "m/s2", "m/s^2")
            linear("fps2", "Foot per Second Squared", "ft/s²", "Acceleration", .3048, "ft/s2")
            linear("g0", "Standard Gravity", "g₀", "Acceleration", 9.80665, "gravity")

            // Data/storage (binary family) and decimal network data
            linear("byte", "Byte", "B", "Data / Storage", 1.0, "bytes")
            linear("kib", "Kibibyte", "KiB", "Data / Storage", 1024.0, "kibibyte")
            linear("mib", "Mebibyte", "MiB", "Data / Storage", 1024.0 * 1024, "mebibyte")
            linear("gib", "Gibibyte", "GiB", "Data / Storage", 1024.0 * 1024 * 1024, "gibibyte")
            linear("kb", "Kilobyte", "kB", "Data / Storage", 1000.0, "kilobyte")
            linear("mb", "Megabyte", "MB", "Data / Storage", 1e6, "megabyte")
            linear("gb", "Gigabyte", "GB", "Data / Storage", 1e9, "gigabyte")
            linear("bit", "Bit", "bit", "Data / Storage", .125, "bits")

            // Angle, time, frequency
            linear("rad", "Radian", "rad", "Angle", 1.0, "radian")
            linear("deg", "Degree", "°", "Angle", PI / 180.0, "degree", "degrees")
            linear("grad", "Gradian", "gon", "Angle", PI / 200.0, "gradian")
            linear("s", "Second", "s", "Time", 1.0, "second", "seconds")
            linear("ms", "Millisecond", "ms", "Time", .001, "millisecond")
            linear("min", "Minute", "min", "Time", 60.0, "minute", "minutes")
            linear("h", "Hour", "h", "Time", 3600.0, "hour", "hours")
            linear("day", "Day", "d", "Time", 86400.0, "days")
            linear("week", "Week", "wk", "Time", 604800.0, "weeks")
            linear("hz", "Hertz", "Hz", "Frequency", 1.0, "hertz")
            linear("khz", "Kilohertz", "kHz", "Frequency", 1e3, "kilohertz")
            linear("mhz", "Megahertz", "MHz", "Frequency", 1e6, "megahertz")
            linear("ghz", "Gigahertz", "GHz", "Frequency", 1e9, "gigahertz")
            linear("rpm", "Revolutions per Minute", "rpm", "Frequency", 1.0 / 60.0)

            // Electrical
            linear("a", "Ampere", "A", "Current", 1.0, "amp", "ampere")
            linear("ma", "Milliampere", "mA", "Current", .001, "milliamp")
            linear("ua", "Microampere", "µA", "Current", 1e-6, "microamp")
            linear("v", "Volt", "V", "Voltage", 1.0, "volt")
            linear("mv", "Millivolt", "mV", "Voltage", .001, "millivolt")
            linear("kv", "Kilovolt", "kV", "Voltage", 1e3, "kilovolt")
            linear("ohm", "Ohm", "Ω", "Resistance", 1.0, "ohms")
            linear("kohm", "Kiloohm", "kΩ", "Resistance", 1e3, "kiloohm")
            linear("mohm", "Megaohm", "MΩ", "Resistance", 1e6, "megaohm")
            linear("coulomb", "Coulomb", "C", "Charge", 1.0, "coulombs")
            linear("ah", "Ampere-hour", "Ah", "Charge", 3600.0, "amp hour")
            linear("mah", "Milliampere-hour", "mAh", "Charge", 3.6, "milliamp hour")
            linear("f_cap", "Farad", "F", "Capacitance", 1.0, "farad")
            linear("uf", "Microfarad", "µF", "Capacitance", 1e-6, "microfarad")
            linear("nf", "Nanofarad", "nF", "Capacitance", 1e-9, "nanofarad")
            linear("h_ind", "Henry", "H", "Inductance", 1.0, "henry")
            linear("mh_ind", "Millihenry", "mH", "Inductance", .001, "millihenry")

            return ConversionRegistry(u)
        }

        private fun normalize(s: String): String = s.trim().lowercase()
            .replace("²", "^2").replace("³", "^3")
            .replace(Regex("\\s+"), " ")
    }
}
