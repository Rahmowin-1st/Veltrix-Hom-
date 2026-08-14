package com.veltrix.calculator.core

internal object V4GeometryFinanceExpansion {
    fun tools(): List<ToolDefinition> = listOf(
        v4FormulaTool(
            "geometry-v4-similarity-length", "Similar-Figure Length Scale", Subject.GEOMETRY,
            "Geometry Expansion", "Similarity", "L2 = k*L1",
            mapOf("L2" to "k*L1", "k" to "L2/L1", "L1" to "L2/k"),
            listOf(v4Field("L2", "Scaled length", "m", "Length", 0.0, allowNegative = false), v4Field("k", "Scale factor", min = 0.0, allowNegative = false), v4Field("L1", "Original length", "m", "Length", 0.0, allowNegative = false))
        ),
        v4FormulaTool(
            "geometry-v4-similarity-area", "Similar-Figure Area Scale", Subject.GEOMETRY,
            "Geometry Expansion", "Similarity", "A2 = A1*k^2",
            mapOf("A2" to "A1*k^2", "A1" to "A2/k^2", "k" to "sqrt(A2/A1)"),
            listOf(v4Field("A2", "Scaled area", "m2", "Area", 0.0, allowNegative = false), v4Field("A1", "Original area", "m2", "Area", 0.0, allowNegative = false), v4Field("k", "Scale factor", min = 0.0, allowNegative = false))
        ),
        v4FormulaTool(
            "geometry-v4-cylinder-surface-area", "Cylinder Total Surface Area", Subject.GEOMETRY,
            "Geometry Expansion", "Solids", "A = 2*pi*r*(r+h)",
            mapOf("A" to "2*pi*r*(r+h)", "h" to "A/(2*pi*r)-r", "r" to "(-h+sqrt(h^2+2*A/pi))/2"),
            listOf(v4Field("A", "Surface area", "m2", "Area", 0.0, allowNegative = false), v4Field("r", "Radius", "m", "Length", 0.0, allowNegative = false), v4Field("h", "Height", "m", "Length", 0.0, allowNegative = false))
        ),
        v4FormulaTool(
            "geometry-v4-cuboid-surface-area", "Cuboid Surface Area", Subject.GEOMETRY,
            "Geometry Expansion", "Solids", "A = 2*(l*w+l*h+w*h)",
            mapOf("A" to "2*(l*w+l*h+w*h)", "l" to "(A/2-w*h)/(w+h)", "w" to "(A/2-l*h)/(l+h)", "h" to "(A/2-l*w)/(l+w)"),
            listOf(v4Field("A", "Surface area", "m2", "Area", 0.0, allowNegative = false), v4Field("l", "Length", "m", "Length", 0.0, allowNegative = false), v4Field("w", "Width", "m", "Length", 0.0, allowNegative = false), v4Field("h", "Height", "m", "Length", 0.0, allowNegative = false))
        ),
        v4FormulaTool(
            "finance-v4-effective-annual-rate", "Effective Annual Rate", Subject.FINANCE,
            "Finance Expansion", "Rates", "EAR = (1+apr/m)^m-1",
            mapOf("EAR" to "(1+apr/m)^m-1", "apr" to "m*((1+EAR)^(1/m)-1)"),
            listOf(v4Field("EAR", "Effective annual rate", min = -0.999), v4Field("apr", "Nominal annual rate", min = -0.999), v4Field("m", "Compounding periods per year", min = 1.0, max = 365.0, allowNegative = false))
        ),
        v4FormulaTool(
            "finance-v4-break-even", "Break-Even Units", Subject.FINANCE,
            "Finance Expansion", "Business", "q = fixed/(price-variable)",
            mapOf("q" to "fixed/(price-variable)", "fixed" to "q*(price-variable)", "price" to "variable+fixed/q", "variable" to "price-fixed/q"),
            listOf(v4Field("q", "Break-even units", min = 0.0, allowNegative = false), v4Field("fixed", "Fixed cost", min = 0.0, allowNegative = false), v4Field("variable", "Variable cost per unit", min = 0.0, allowNegative = false), v4Field("price", "Selling price per unit", min = 0.0, allowNegative = false))
        ),
        v4FormulaTool(
            "finance-v4-straight-line-depreciation", "Straight-Line Depreciation", Subject.FINANCE,
            "Finance Expansion", "Depreciation", "value = cost-(cost-salvage)*years/life",
            mapOf("value" to "cost-(cost-salvage)*years/life", "salvage" to "cost-(cost-value)*life/years", "years" to "(cost-value)*life/(cost-salvage)", "life" to "(cost-salvage)*years/(cost-value)"),
            listOf(v4Field("value", "Book value", min = 0.0, allowNegative = false), v4Field("cost", "Initial cost", min = 0.0, allowNegative = false), v4Field("salvage", "Salvage value", min = 0.0, allowNegative = false), v4Field("years", "Elapsed years", min = 0.0, allowNegative = false), v4Field("life", "Useful life years", min = 0.0, allowNegative = false))
        ),
        v4FormulaTool(
            "finance-v4-savings-growth", "Savings Compound Growth", Subject.FINANCE,
            "Finance Expansion", "Savings", "FV = P*(1+r)^n",
            mapOf("FV" to "P*(1+r)^n", "P" to "FV/(1+r)^n", "r" to "(FV/P)^(1/n)-1", "n" to "ln(FV/P)/ln(1+r)"),
            listOf(v4Field("FV", "Future value", min = 0.0, allowNegative = false), v4Field("P", "Starting principal", min = 0.0, allowNegative = false), v4Field("r", "Rate per period", min = 0.0, max = 1.0, allowNegative = false), v4Field("n", "Periods", min = 1.0, allowNegative = false))
        ),
        v4FormulaTool(
            "finance-v4-continuous-compounding", "Continuous Compounding", Subject.FINANCE,
            "Finance Expansion", "Growth", "A = P*exp(r*t)",
            mapOf("A" to "P*exp(r*t)", "P" to "A/exp(r*t)", "r" to "ln(A/P)/t", "t" to "ln(A/P)/r"),
            listOf(v4Field("A", "Future amount", min = 0.0, allowNegative = false), v4Field("P", "Principal", min = 0.0, allowNegative = false), v4Field("r", "Continuous rate"), v4Field("t", "Time", min = 0.0, allowNegative = false))
        )
    )
}
