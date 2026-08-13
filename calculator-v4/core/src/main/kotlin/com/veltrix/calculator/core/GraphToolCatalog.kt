package com.veltrix.calculator.core

internal object GraphToolCatalog {
    fun tools(): List<ToolDefinition> = listOf(
        graph("graph-line", "Line Graph", "Line", "Structured line graph using slope/intercept or two points.", listOf(
            n("m", "Slope", false), n("b", "Y-intercept", false), n("x1", "x₁", false), n("y1", "y₁", false), n("x2", "x₂", false), n("y2", "y₂", false)
        ), setOf("line", "linear graph")),
        graph("graph-parabola", "Parabola", "Parabola", "Structured parabola in vertex or standard form.", listOf(
            n("a", "a"), n("h", "h", false), n("k", "k", false), n("b", "b", false), n("c", "c", false),
            InputFieldDefinition("form", "Form", InputKind.SELECT, required = false, options = listOf("vertex", "standard"))
        ), setOf("quadratic graph", "parabola graph"), widget = true),
        graph("graph-circle", "Circle Graph", "Circle", "Circle from center and radius.", listOf(n("h", "Center x"), n("k", "Center y"), positive("r", "Radius")), setOf("circle"), widget = true),
        graph("graph-ellipse", "Ellipse Graph", "Ellipse", "Ellipse from center and semiaxes.", listOf(n("h", "Center x"), n("k", "Center y"), positive("a", "Semiaxis x"), positive("b", "Semiaxis y")), setOf("ellipse"), widget = true),
        graph("graph-hyperbola", "Hyperbola Graph", "Hyperbola", "Horizontal or vertical standard-form hyperbola.", listOf(n("h", "Center x"), n("k", "Center y"), positive("a", "a"), positive("b", "b"), InputFieldDefinition("orientation", "Orientation", InputKind.SELECT, options = listOf("horizontal", "vertical"))), setOf("hyperbola"), widget = true)
    )

    private fun graph(id:String,title:String,topic:String,description:String,inputs:List<InputFieldDefinition>,aliases:Set<String>,widget:Boolean=false)=ToolDefinition(
        id=id,title=title,subject=Subject.MATH,category="Graphing",topic=topic,description=description,aliases=aliases,
        keywords=(aliases+"graph"+topic).map{it.lowercase()}.toSet(), environmentFamily=EnvironmentFamily.GraphTool,executorKind=ToolExecutorKind.GRAPH,
        inputSchema=inputs,outputSchema=listOf(OutputFieldDefinition("graph","Graph data",OutputKind.GRAPH)),
        graphDefinition=GraphDefinition(topic.lowercase(),inputs.map{it.id}),supportsWidget=widget,
        supportedWidgetSizes=if(widget) setOf(WidgetSize.SMALL,WidgetSize.MEDIUM,WidgetSize.LARGE) else emptySet(),supportsFloatingCompactMode=widget
    )
    private fun n(id:String,label:String,required:Boolean=true)=InputFieldDefinition(id,label,InputKind.NUMBER,required=required)
    private fun positive(id:String,label:String)=InputFieldDefinition(id,label,InputKind.NUMBER,min=0.0,allowNegative=false)
}
