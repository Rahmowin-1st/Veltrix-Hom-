package com.veltrix.calculator.core

/** Broad, coherent catalog. Every FORMULA entry is executable by FormulaEngine. */
internal object FormulaCatalog {
    fun tools(): List<ToolDefinition> = buildList {
        // Math arithmetic / number
        add(formula("percentage-of", "Percentage Of", Subject.MATH, "Arithmetic", "Percentages", "Calculate a percentage of a value.",
            "result = percent/100 × value", mapOf("result" to "percent/100*value", "percent" to "result/value*100", "value" to "result/(percent/100)"),
            listOf(n("percent", "Percent"), n("value", "Value"), n("result", "Result", required = false)), aliases = setOf("percent of", "percentage"), widget = true))
        add(formula("ratio-proportion", "Proportion Solver", Subject.MATH, "Arithmetic", "Ratios and proportions", "Solve a/b = c/d for one missing value.",
            "a/b = c/d", mapOf("a" to "b*c/d", "b" to "a*d/c", "c" to "a*d/b", "d" to "b*c/a"),
            listOf(n("a", "a"), n("b", "b"), n("c", "c"), n("d", "d")), aliases = setOf("proportion", "ratio solver")))
        add(special("gcd-lcm", "GCD / LCM", Subject.MATH, "Arithmetic", "Integers", "Greatest common divisor and least common multiple.", ToolExecutorKind.MATH_UTILITY,
            listOf(InputFieldDefinition("values", "Integers", InputKind.DATASET)), listOf(OutputFieldDefinition("gcd", "GCD"), OutputFieldDefinition("lcm", "LCM")), aliases = setOf("gcd", "lcm", "greatest common divisor", "least common multiple")))
        add(special("prime-factorization", "Prime Factorization", Subject.MATH, "Arithmetic", "Integers", "Prime factorization for safe bounded integers.", ToolExecutorKind.MATH_UTILITY,
            listOf(InputFieldDefinition("value", "Integer", InputKind.INTEGER)), listOf(OutputFieldDefinition("factors", "Prime factors", OutputKind.TEXT)), aliases = setOf("prime factors", "factorization")))
        add(special("permutations-combinations", "Permutations / Combinations", Subject.MATH, "Probability", "Combinatorics", "Calculate nPr and nCr exactly for bounded non-negative integers.", ToolExecutorKind.MATH_UTILITY,
            listOf(InputFieldDefinition("n", "n", InputKind.INTEGER), InputFieldDefinition("r", "r", InputKind.INTEGER)), listOf(OutputFieldDefinition("nPr", "nPr"), OutputFieldDefinition("nCr", "nCr")), aliases = setOf("ncr", "npr", "combinations", "permutations")))
        add(special("arithmetic-sequence", "Arithmetic Sequence", Subject.MATH, "Algebra", "Sequences", "Arithmetic progression nth term and finite sum.", ToolExecutorKind.MATH_UTILITY,
            listOf(n("first", "First term"), n("difference", "Common difference"), InputFieldDefinition("n", "n", InputKind.INTEGER)), listOf(OutputFieldDefinition("nth", "Nth term"), OutputFieldDefinition("sum", "Sum")), aliases = setOf("arithmetic progression", "ap")))
        add(special("geometric-sequence", "Geometric Sequence", Subject.MATH, "Algebra", "Sequences", "Geometric progression nth term and finite sum.", ToolExecutorKind.MATH_UTILITY,
            listOf(n("first", "First term"), n("ratio", "Common ratio"), InputFieldDefinition("n", "n", InputKind.INTEGER)), listOf(OutputFieldDefinition("nth", "Nth term"), OutputFieldDefinition("sum", "Sum")), aliases = setOf("geometric progression", "gp")))

        // Physics
        add(physics("speed", "Speed / Distance / Time", "Motion", "v = d/t", mapOf("v" to "d/t", "d" to "v*t", "t" to "d/v"), listOf(
            q("v", "Speed", "m/s", "Speed", false), q("d", "Distance", "m", "Length", false), q("t", "Time", "s", "Time", false))))
        add(physics("acceleration", "Acceleration", "Motion", "a = (v-u)/t", mapOf("a" to "(v-u)/t", "v" to "u+a*t", "u" to "v-a*t", "t" to "(v-u)/a"), listOf(
            q("a", "Acceleration", "m/s²", "Acceleration"), q("v", "Final velocity", "m/s", "Speed"), q("u", "Initial velocity", "m/s", "Speed"), q("t", "Time", "s", "Time", false))))
        add(physics("force", "Force", "Mechanics", "F = m*a", mapOf("F" to "m*a", "m" to "F/a", "a" to "F/m"), listOf(
            q("F", "Force", "N", "Force"), q("m", "Mass", "kg", "Mass", false), q("a", "Acceleration", "m/s²", "Acceleration"))))
        add(physics("momentum", "Momentum", "Mechanics", "p = m*v", mapOf("p" to "m*v", "m" to "p/v", "v" to "p/m"), listOf(
            q("p", "Momentum", "kg·m/s", null), q("m", "Mass", "kg", "Mass", false), q("v", "Velocity", "m/s", "Speed"))))
        add(physics("impulse", "Impulse", "Mechanics", "J = F*t", mapOf("J" to "F*t", "F" to "J/t", "t" to "J/F"), listOf(
            q("J", "Impulse", "N·s", null), q("F", "Force", "N", "Force"), q("t", "Time", "s", "Time", false))))
        add(physics("work", "Work", "Energy", "W = F*d", mapOf("W" to "F*d", "F" to "W/d", "d" to "W/F"), listOf(
            q("W", "Work", "J", "Energy"), q("F", "Force", "N", "Force"), q("d", "Distance", "m", "Length"))))
        add(physics("kinetic-energy", "Kinetic Energy", "Energy", "KE = 0.5*m*v²", mapOf("KE" to "0.5*m*v^2", "m" to "2*KE/v^2", "v" to "sqrt(2*KE/m)"), listOf(
            q("KE", "Kinetic energy", "J", "Energy", false), q("m", "Mass", "kg", "Mass", false), q("v", "Speed", "m/s", "Speed", false))))
        add(physics("potential-energy", "Gravitational Potential Energy", "Energy", "PE = m*g*h", mapOf("PE" to "m*g*h", "m" to "PE/(g*h)", "g" to "PE/(m*h)", "h" to "PE/(m*g)"), listOf(
            q("PE", "Potential energy", "J", "Energy"), q("m", "Mass", "kg", "Mass", false), q("g", "Gravity", "m/s²", "Acceleration", false), q("h", "Height", "m", "Length"))))
        add(physics("power-work-time", "Power", "Energy", "P = W/t", mapOf("P" to "W/t", "W" to "P*t", "t" to "W/P"), listOf(
            q("P", "Power", "W", "Power"), q("W", "Work", "J", "Energy"), q("t", "Time", "s", "Time", false))))
        add(physics("pressure", "Pressure", "Mechanics", "p = F/A", mapOf("p" to "F/A", "F" to "p*A", "A" to "F/p"), listOf(
            q("p", "Pressure", "Pa", "Pressure"), q("F", "Force", "N", "Force"), q("A", "Area", "m²", "Area", false))))
        add(physics("density", "Density", "Mechanics", "ρ = m/V", mapOf("rho" to "m/V", "m" to "rho*V", "V" to "m/rho"), listOf(
            q("rho", "Density", "kg/m³", "Density", false), q("m", "Mass", "kg", "Mass", false), q("V", "Volume", "m³", "Volume", false))))
        add(physics("torque", "Torque", "Rotation", "τ = F*r", mapOf("tau" to "F*r", "F" to "tau/r", "r" to "tau/F"), listOf(
            q("tau", "Torque", "N·m", "Torque"), q("F", "Force", "N", "Force"), q("r", "Lever arm", "m", "Length", false))))
        add(physics("frequency-period", "Frequency / Period", "Waves", "f = 1/T", mapOf("f" to "1/T", "T" to "1/f"), listOf(
            q("f", "Frequency", "Hz", "Frequency", false), q("T", "Period", "s", "Time", false))))
        add(physics("wave-speed", "Wave Speed", "Waves", "v = f*lambda", mapOf("v" to "f*lambda", "f" to "v/lambda", "lambda" to "v/f"), listOf(
            q("v", "Wave speed", "m/s", "Speed", false), q("f", "Frequency", "Hz", "Frequency", false), q("lambda", "Wavelength", "m", "Length", false))))
        add(physics("ohms-law", "Ohm's Law", "Electricity", "V = I*R", mapOf("V" to "I*R", "I" to "V/R", "R" to "V/I"), listOf(
            q("V", "Voltage", "V", "Voltage"), q("I", "Current", "A", "Current"), q("R", "Resistance", "Ω", "Resistance", false)), aliases = setOf("ohm", "ohms law"), widget = true))
        add(physics("electrical-power", "Electrical Power", "Electricity", "P = V*I", mapOf("P" to "V*I", "V" to "P/I", "I" to "P/V"), listOf(
            q("P", "Power", "W", "Power"), q("V", "Voltage", "V", "Voltage"), q("I", "Current", "A", "Current")), widget = true))
        add(physics("heat-energy", "Heat Energy", "Thermal", "Q = m*c*dT", mapOf("Q" to "m*c*dT", "m" to "Q/(c*dT)", "c" to "Q/(m*dT)", "dT" to "Q/(m*c)"), listOf(
            q("Q", "Heat", "J", "Energy"), q("m", "Mass", "kg", "Mass", false), q("c", "Specific heat", "J/(kg·K)", null, false), q("dT", "Temperature change", "K", null))))
        add(physics("ideal-lens", "Thin Lens", "Optics", "1/f = 1/do + 1/di", mapOf("f" to "1/(1/do+1/di)", "do" to "1/(1/f-1/di)", "di" to "1/(1/f-1/do)"), listOf(
            q("f", "Focal length", "m", "Length"), q("do", "Object distance", "m", "Length"), q("di", "Image distance", "m", "Length"))))

        // Geometry 2D / 3D / coordinate
        add(geometry("rectangle-area", "Rectangle Area", "Rectangle", "A = w*h", mapOf("A" to "w*h", "w" to "A/h", "h" to "A/w"), listOf(g("A", "Area", "m²", "Area", false), g("w", "Width", "m", "Length", false), g("h", "Height", "m", "Length", false)), widget = true))
        add(geometry("rectangle-perimeter", "Rectangle Perimeter", "Rectangle", "P = 2(w+h)", mapOf("P" to "2*(w+h)", "w" to "P/2-h", "h" to "P/2-w"), listOf(g("P", "Perimeter", "m", "Length", false), g("w", "Width", "m", "Length", false), g("h", "Height", "m", "Length", false))))
        add(geometry("square", "Square", "Square", "A = s²", mapOf("A" to "s^2", "s" to "sqrt(A)"), listOf(g("A", "Area", "m²", "Area", false), g("s", "Side", "m", "Length", false))))
        add(geometry("triangle-area", "Triangle Area", "Triangle", "A = b*h/2", mapOf("A" to "b*h/2", "b" to "2*A/h", "h" to "2*A/b"), listOf(g("A", "Area", "m²", "Area", false), g("b", "Base", "m", "Length", false), g("h", "Height", "m", "Length", false)), widget = true))
        add(geometry("right-triangle", "Right Triangle", "Triangle", "c² = a² + b²", mapOf("c" to "sqrt(a^2+b^2)", "a" to "sqrt(c^2-b^2)", "b" to "sqrt(c^2-a^2)"), listOf(g("a", "Leg a", "m", "Length", false), g("b", "Leg b", "m", "Length", false), g("c", "Hypotenuse", "m", "Length", false)), aliases = setOf("pythagorean theorem", "pythagoras"), widget = true))
        add(geometry("heron-area", "Heron's Formula", "Triangle", "A = sqrt(s(s-a)(s-b)(s-c))", mapOf("A" to "sqrt(((a+b+c)/2)*(((a+b+c)/2)-a)*(((a+b+c)/2)-b)*(((a+b+c)/2)-c))"), listOf(g("a", "Side a", "m", "Length", false), g("b", "Side b", "m", "Length", false), g("c", "Side c", "m", "Length", false), g("A", "Area", "m²", "Area", false)), aliases = setOf("heron")))
        add(geometry("parallelogram-area", "Parallelogram Area", "Parallelogram", "A = b*h", mapOf("A" to "b*h", "b" to "A/h", "h" to "A/b"), listOf(g("A", "Area", "m²", "Area", false), g("b", "Base", "m", "Length", false), g("h", "Height", "m", "Length", false))))
        add(geometry("trapezoid-area", "Trapezoid Area", "Trapezoid", "A = (a+b)h/2", mapOf("A" to "(a+b)*h/2", "h" to "2*A/(a+b)", "a" to "2*A/h-b", "b" to "2*A/h-a"), listOf(g("A", "Area", "m²", "Area", false), g("a", "Base a", "m", "Length", false), g("b", "Base b", "m", "Length", false), g("h", "Height", "m", "Length", false))))
        add(geometry("circle-area", "Circle Area", "Circle", "A = pi*r²", mapOf("A" to "pi*r^2", "r" to "sqrt(A/pi)"), listOf(g("A", "Area", "m²", "Area", false), g("r", "Radius", "m", "Length", false)), widget = true))
        add(geometry("circle-circumference", "Circle Circumference", "Circle", "C = 2*pi*r", mapOf("C" to "2*pi*r", "r" to "C/(2*pi)"), listOf(g("C", "Circumference", "m", "Length", false), g("r", "Radius", "m", "Length", false))))
        add(geometry("sector-area", "Sector Area", "Circle", "A = theta/360*pi*r²", mapOf("A" to "theta/360*pi*r^2", "theta" to "360*A/(pi*r^2)", "r" to "sqrt(360*A/(theta*pi))"), listOf(g("A", "Area", "m²", "Area", false), g("theta", "Angle", "°", "Angle", false), g("r", "Radius", "m", "Length", false))))
        add(geometry("arc-length", "Arc Length", "Circle", "L = theta/360*2*pi*r", mapOf("L" to "theta/360*2*pi*r", "theta" to "360*L/(2*pi*r)", "r" to "360*L/(2*pi*theta)"), listOf(g("L", "Arc length", "m", "Length", false), g("theta", "Angle", "°", "Angle", false), g("r", "Radius", "m", "Length", false))))
        add(geometry("ellipse-area", "Ellipse Area", "Ellipse", "A = pi*a*b", mapOf("A" to "pi*a*b", "a" to "A/(pi*b)", "b" to "A/(pi*a)"), listOf(g("A", "Area", "m²", "Area", false), g("a", "Semimajor axis", "m", "Length", false), g("b", "Semiminor axis", "m", "Length", false))))
        add(geometry("cuboid-volume", "Cuboid Volume", "Cuboid", "V = l*w*h", mapOf("V" to "l*w*h", "l" to "V/(w*h)", "w" to "V/(l*h)", "h" to "V/(l*w)"), listOf(g("V", "Volume", "m³", "Volume", false), g("l", "Length", "m", "Length", false), g("w", "Width", "m", "Length", false), g("h", "Height", "m", "Length", false))))
        add(geometry("cylinder-volume", "Cylinder Volume", "Cylinder", "V = pi*r²*h", mapOf("V" to "pi*r^2*h", "r" to "sqrt(V/(pi*h))", "h" to "V/(pi*r^2)"), listOf(g("V", "Volume", "m³", "Volume", false), g("r", "Radius", "m", "Length", false), g("h", "Height", "m", "Length", false)), widget = true))
        add(geometry("cone-volume", "Cone Volume", "Cone", "V = pi*r²*h/3", mapOf("V" to "pi*r^2*h/3", "r" to "sqrt(3*V/(pi*h))", "h" to "3*V/(pi*r^2)"), listOf(g("V", "Volume", "m³", "Volume", false), g("r", "Radius", "m", "Length", false), g("h", "Height", "m", "Length", false))))
        add(geometry("sphere-volume", "Sphere Volume", "Sphere", "V = 4*pi*r³/3", mapOf("V" to "4*pi*r^3/3", "r" to "root(3*V/(4*pi),3)"), listOf(g("V", "Volume", "m³", "Volume", false), g("r", "Radius", "m", "Length", false))))
        add(special("coordinate-distance", "Point Distance", Subject.GEOMETRY, "Coordinate Geometry", "Points", "Distance between two Cartesian points.", ToolExecutorKind.GEOMETRY,
            listOf(n("x1", "x₁"), n("y1", "y₁"), n("x2", "x₂"), n("y2", "y₂")), listOf(OutputFieldDefinition("distance", "Distance")), aliases = setOf("distance formula")))
        add(special("coordinate-midpoint", "Midpoint", Subject.GEOMETRY, "Coordinate Geometry", "Points", "Midpoint between two Cartesian points.", ToolExecutorKind.GEOMETRY,
            listOf(n("x1", "x₁"), n("y1", "y₁"), n("x2", "x₂"), n("y2", "y₂")), listOf(OutputFieldDefinition("midpoint", "Midpoint", OutputKind.STRUCTURED))))
        add(special("line-slope", "Slope", Subject.GEOMETRY, "Coordinate Geometry", "Line", "Slope through two points with vertical-line handling.", ToolExecutorKind.GEOMETRY,
            listOf(n("x1", "x₁"), n("y1", "y₁"), n("x2", "x₂"), n("y2", "y₂")), listOf(OutputFieldDefinition("slope", "Slope"))))

        add(geometry("rhombus-area", "Rhombus Area", "Rhombus", "A = d1*d2/2", mapOf("A" to "d1*d2/2", "d1" to "2*A/d2", "d2" to "2*A/d1"), listOf(g("A","Area","m²","Area",false),g("d1","Diagonal 1","m","Length",false),g("d2","Diagonal 2","m","Length",false))))
        add(geometry("regular-polygon", "Regular Polygon", "Polygon", "P = n*s; A = n*s²/(4*tan(pi/n))", mapOf("P" to "n*s", "A" to "n*s^2/(4*tan(pi/n))"), listOf(InputFieldDefinition("n","Number of sides",InputKind.INTEGER,min=3.0,allowNegative=false),g("s","Side length","m","Length",false),g("P","Perimeter","m","Length",false),g("A","Area","m²","Area",false))))
        add(geometry("prism-volume", "Prism Volume", "Prism", "V = B*h", mapOf("V" to "B*h", "B" to "V/h", "h" to "V/B"), listOf(g("V","Volume","m³","Volume",false),g("B","Base area","m²","Area",false),g("h","Height","m","Length",false))))
        add(geometry("cube", "Cube", "Cube", "V = s³", mapOf("V" to "s^3", "s" to "root(V,3)"), listOf(g("V","Volume","m³","Volume",false),g("s","Side","m","Length",false))))

        // Chemistry
        add(chem("mass-moles", "Mass ↔ Moles", "Amount of Substance", "n = m/M", mapOf("n" to "m/M", "m" to "n*M", "M" to "m/n"), listOf(
            q("n", "Amount", "mol", null, false), q("m", "Mass", "g", "Mass", false), q("M", "Molar mass", "g/mol", null, false))))
        add(chem("molarity", "Molarity", "Solutions", "C = n/V", mapOf("C" to "n/V", "n" to "C*V", "V" to "n/C"), listOf(
            q("C", "Molarity", "mol/L", null, false), q("n", "Amount", "mol", null, false), q("V", "Solution volume", "L", "Volume", false))))
        add(chem("dilution", "Dilution", "Solutions", "C1*V1 = C2*V2", mapOf("C1" to "C2*V2/V1", "V1" to "C2*V2/C1", "C2" to "C1*V1/V2", "V2" to "C1*V1/C2"), listOf(
            q("C1", "Initial concentration", "mol/L", null, false), q("V1", "Initial volume", "L", "Volume", false), q("C2", "Final concentration", "mol/L", null, false), q("V2", "Final volume", "L", "Volume", false))))
        add(chem("ideal-gas", "Ideal Gas Law", "Gases", "P*V = n*R*T", mapOf("P" to "n*8.314462618*T/V", "V" to "n*8.314462618*T/P", "n" to "P*V/(8.314462618*T)", "T" to "P*V/(n*8.314462618)"), listOf(
            q("P", "Pressure", "Pa", "Pressure", false), q("V", "Volume", "m³", "Volume", false), q("n", "Amount", "mol", null, false), q("T", "Temperature", "K", "Temperature", false)), aliases = setOf("pv=nrt", "gas law")))
        add(chem("solution-density", "Solution Density", "Solutions", "rho = m/V", mapOf("rho" to "m/V", "m" to "rho*V", "V" to "m/rho"), listOf(
            q("rho", "Density", "kg/m³", "Density", false), q("m", "Mass", "kg", "Mass", false), q("V", "Volume", "m³", "Volume", false))))
        add(special("percent-composition", "Percent Composition", Subject.CHEMISTRY, "Composition", "Chemical formulas", "Element-by-element mass percentages for a supported chemical formula.", ToolExecutorKind.CHEMISTRY,
            listOf(InputFieldDefinition("formula", "Chemical formula", InputKind.TEXT)), listOf(OutputFieldDefinition("composition", "Percent composition", OutputKind.STRUCTURED))))

        add(chem("stoichiometric-ratio", "Stoichiometric Mole Ratio", "Stoichiometry", "n2 = n1*c2/c1", mapOf("n2" to "n1*c2/c1", "n1" to "n2*c1/c2"), listOf(
            q("n1","Known amount","mol",null,false), InputFieldDefinition("c1","Known coefficient",InputKind.NUMBER,min=0.0,allowNegative=false), InputFieldDefinition("c2","Target coefficient",InputKind.NUMBER,min=0.0,allowNegative=false), q("n2","Target amount","mol",null,false)), aliases=setOf("stoichiometry", "mole ratio")))

        // Statistics variants are discoverable while sharing one tested engine.
        for ((id, title, op) in listOf(
            Triple("mean", "Mean", "mean"), Triple("median", "Median", "median"), Triple("mode", "Mode", "mode"),
            Triple("range", "Range", "range"), Triple("variance", "Variance", "variance"), Triple("standard-deviation", "Standard Deviation", "stddev")
        )) add(special(id, title, Subject.STATISTICS, "Descriptive Statistics", "Dataset", "$title of a numeric dataset.", ToolExecutorKind.STATISTICS,
            listOf(InputFieldDefinition("data", "Dataset", InputKind.DATASET), InputFieldDefinition("operation", "Operation", InputKind.SELECT, required = false, options = listOf(op))), listOf(OutputFieldDefinition("result", title)), aliases = if (id=="standard-deviation") setOf("std", "stddev") else emptySet()))
        add(special("weighted-mean", "Weighted Mean", Subject.STATISTICS, "Descriptive Statistics", "Weighted data", "Weighted arithmetic mean.", ToolExecutorKind.STATISTICS,
            listOf(InputFieldDefinition("data", "Values", InputKind.DATASET), InputFieldDefinition("weights", "Weights", InputKind.DATASET)), listOf(OutputFieldDefinition("result", "Weighted mean"))))
        add(special("percentile", "Percentile / Quantile", Subject.STATISTICS, "Descriptive Statistics", "Quantiles", "Interpolated percentile for a numeric dataset.", ToolExecutorKind.STATISTICS,
            listOf(InputFieldDefinition("data", "Dataset", InputKind.DATASET), n("percentile", "Percentile")), listOf(OutputFieldDefinition("result", "Percentile"))))

        // Finance
        add(fin("percentage-change", "Percentage Change", "Percentages", "change% = (new-old)/old*100", mapOf("change" to "(new-old)/old*100", "new" to "old*(1+change/100)", "old" to "new/(1+change/100)"), listOf(n("old", "Old value"), n("new", "New value"), n("change", "Change %", required = false))))
        add(fin("discount", "Discount", "Shopping Math", "final = price*(1-discount/100)", mapOf("final" to "price*(1-discount/100)", "price" to "final/(1-discount/100)", "discount" to "(1-final/price)*100"), listOf(n("price", "Original price"), n("discount", "Discount %"), n("final", "Final price", required = false)), widget = true))
        add(fin("tax", "Tax", "Shopping Math", "total = subtotal*(1+rate/100)", mapOf("total" to "subtotal*(1+rate/100)", "subtotal" to "total/(1+rate/100)", "rate" to "(total/subtotal-1)*100"), listOf(n("subtotal", "Subtotal"), n("rate", "Tax rate %"), n("total", "Total", required = false))))
        add(fin("markup", "Markup", "Business Math", "price = cost*(1+markup/100)", mapOf("price" to "cost*(1+markup/100)", "cost" to "price/(1+markup/100)", "markup" to "(price/cost-1)*100"), listOf(n("cost", "Cost"), n("markup", "Markup %"), n("price", "Selling price", required = false))))
        add(fin("margin", "Margin", "Business Math", "margin% = (revenue-cost)/revenue*100", mapOf("margin" to "(revenue-cost)/revenue*100", "cost" to "revenue*(1-margin/100)", "revenue" to "cost/(1-margin/100)"), listOf(n("revenue", "Revenue"), n("cost", "Cost"), n("margin", "Margin %", required = false))))
        add(fin("simple-interest", "Simple Interest", "Interest", "A = P*(1+r*t/100)", mapOf("A" to "P*(1+r*t/100)", "P" to "A/(1+r*t/100)", "r" to "(A/P-1)*100/t", "t" to "(A/P-1)*100/r"), listOf(n("P", "Principal"), n("r", "Annual rate %"), n("t", "Years"), n("A", "Final amount", required = false)), widget = true))
        add(fin("compound-interest", "Compound Interest", "Interest", "A = P*(1+r/(100*n))^(n*t)", mapOf("A" to "P*(1+r/(100*n))^(n*t)", "P" to "A/(1+r/(100*n))^(n*t)"), listOf(n("P", "Principal"), n("r", "Annual rate %"), n("n", "Compounds per year"), n("t", "Years"), n("A", "Final amount", required = false)), widget = true))
        add(fin("tip", "Tip", "Everyday Finance", "total = bill*(1+tip/100)", mapOf("total" to "bill*(1+tip/100)", "bill" to "total/(1+tip/100)", "tip" to "(total/bill-1)*100"), listOf(n("bill", "Bill"), n("tip", "Tip %"), n("total", "Total", required = false)), widget = true))
        add(special("split-bill", "Split Bill", Subject.FINANCE, "Everyday Finance", "Bill sharing", "Split bill, optional tip, and per-person amount.", ToolExecutorKind.FINANCE,
            listOf(n("bill", "Bill"), n("tip", "Tip %", required = false), InputFieldDefinition("people", "People", InputKind.INTEGER, min = 1.0)), listOf(OutputFieldDefinition("total", "Total"), OutputFieldDefinition("perPerson", "Per person")), aliases = setOf("bill split"), widget = true))
        add(special("loan-payment", "Loan Payment", Subject.FINANCE, "Loans", "Amortization", "Fixed-rate monthly payment for a standard amortizing loan.", ToolExecutorKind.FINANCE,
            listOf(n("principal", "Principal"), n("annualRate", "Annual rate %"), InputFieldDefinition("months", "Months", InputKind.INTEGER, min = 1.0)), listOf(OutputFieldDefinition("monthlyPayment", "Monthly payment"), OutputFieldDefinition("totalPaid", "Total paid")), aliases = setOf("loan", "monthly payment")))
    }

    private fun physics(id: String, title: String, topic: String, display: String, rules: Map<String, String>, fields: List<InputFieldDefinition>, aliases: Set<String> = emptySet(), widget: Boolean = false) =
        formula("physics-$id", title, Subject.PHYSICS, "Physics", topic, "Solve $display for a selected unknown using canonical units.", display, rules, fields, aliases, widget, family = EnvironmentFamily.FormulaSolver)

    private fun geometry(id: String, title: String, topic: String, display: String, rules: Map<String, String>, fields: List<InputFieldDefinition>, aliases: Set<String> = emptySet(), widget: Boolean = false) =
        formula("geometry-$id", title, Subject.GEOMETRY, "Geometry", topic, "Purpose-built $title calculator with validated dimensions.", display, rules, fields, aliases, widget, family = EnvironmentFamily.GeometryTool)

    private fun chem(id: String, title: String, topic: String, display: String, rules: Map<String, String>, fields: List<InputFieldDefinition>, aliases: Set<String> = emptySet()) =
        formula("chemistry-$id", title, Subject.CHEMISTRY, "Chemistry", topic, "Structured chemistry numeric calculator.", display, rules, fields, aliases, false, family = EnvironmentFamily.FormulaSolver)

    private fun fin(id: String, title: String, topic: String, display: String, rules: Map<String, String>, fields: List<InputFieldDefinition>, widget: Boolean = false) =
        formula("finance-$id", title, Subject.FINANCE, "Finance", topic, "Deterministic $title calculator.", display, rules, fields, emptySet(), widget, family = EnvironmentFamily.FinanceTool)

    private fun formula(
        id: String, title: String, subject: Subject, category: String, topic: String, description: String,
        display: String, rules: Map<String, String>, fields: List<InputFieldDefinition>, aliases: Set<String> = emptySet(),
        widget: Boolean = false, family: EnvironmentFamily = EnvironmentFamily.FormulaSolver
    ) = ToolDefinition(
        id = id, title = title, subject = subject, category = category, topic = topic, description = description,
        aliases = aliases, keywords = (aliases + topic + category).map { it.lowercase() }.toSet(),
        environmentFamily = family, executorKind = ToolExecutorKind.FORMULA,
        inputSchema = fields, outputSchema = rules.keys.map { OutputFieldDefinition(it, it) },
        formulaDefinition = FormulaDefinition(display, rules),
        validationRules = fields.filter { !it.allowNegative }.map { "${it.id} must be non-negative" },
        supportsWidget = widget, supportedWidgetSizes = if (widget) setOf(WidgetSize.MEDIUM, WidgetSize.LARGE) else emptySet(),
        supportsFloatingCompactMode = widget
    )

    private fun special(
        id: String, title: String, subject: Subject, category: String, topic: String, description: String,
        kind: ToolExecutorKind, inputs: List<InputFieldDefinition>, outputs: List<OutputFieldDefinition>, aliases: Set<String> = emptySet(), widget: Boolean = false
    ) = ToolDefinition(
        id = id, title = title, subject = subject, category = category, topic = topic, description = description,
        aliases = aliases, keywords = (aliases + category + topic).map { it.lowercase() }.toSet(),
        environmentFamily = when (kind) {
            ToolExecutorKind.STATISTICS -> EnvironmentFamily.StatisticsTool
            ToolExecutorKind.FINANCE -> EnvironmentFamily.FinanceTool
            ToolExecutorKind.GEOMETRY -> EnvironmentFamily.GeometryTool
            ToolExecutorKind.CHEMISTRY -> EnvironmentFamily.FormulaSolver
            else -> EnvironmentFamily.FormulaSolver
        }, executorKind = kind, inputSchema = inputs, outputSchema = outputs,
        supportsWidget = widget, supportedWidgetSizes = if (widget) setOf(WidgetSize.MEDIUM, WidgetSize.LARGE) else emptySet()
    )

    private fun n(id: String, label: String, required: Boolean = true) = InputFieldDefinition(id, label, InputKind.NUMBER, required = required)
    private fun q(id: String, label: String, unit: String, category: String?, allowNegative: Boolean = true) = InputFieldDefinition(id, label, InputKind.NUMBER, required = true, canonicalUnit = unit, unitCategory = category, allowNegative = allowNegative, min = if (allowNegative) null else 0.0)
    private fun g(id: String, label: String, unit: String, category: String?, allowNegative: Boolean = true) = InputFieldDefinition(id, label, InputKind.NUMBER, required = true, canonicalUnit = unit, unitCategory = category, min = if (allowNegative) null else 0.0, allowNegative = allowNegative)
}
