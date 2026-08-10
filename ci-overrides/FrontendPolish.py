from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('ci-project/VeltrixCalculator')
main = root / 'app/src/main/kotlin/com/veltrix/calculator/app/MainActivity.kt'
ui = root / 'app/src/main/kotlin/com/veltrix/calculator/app/VeltrixUi.kt'

s = main.read_text()
replacements = [
    ('import android.text.TextWatcher\n', 'import android.text.TextWatcher\nimport android.util.TypedValue\n'),
    ('setPadding(dp(18), dp(30), dp(18), dp(112))', 'setPadding(dp(18), dp(22), dp(18), dp(92))'),
    ('private fun title(text: String, size: Float = 29f)', 'private fun title(text: String, size: Float = 28f)'),
    ('FrameLayout.LayoutParams(-1, dp(60), Gravity.BOTTOM)', 'FrameLayout.LayoutParams(-1, dp(56), Gravity.BOTTOM)'),
    ('bottomMargin = dp(14)', 'bottomMargin = dp(10)'),
    ('subtitle("Calculator • smart math workspace")', 'subtitle("Smart math workspace")'),
    ('setPadding(dp(4), dp(12), 0, dp(9))', 'setPadding(dp(4), dp(8), 0, dp(5))'),
    ('minLines = 2\n            maxLines = 5\n            gravity = Gravity.TOP or Gravity.START', 'minLines = 1\n            maxLines = 4\n            minHeight = dp(62)\n            gravity = Gravity.CENTER_VERTICAL or Gravity.START'),
    ('textSize = 37f', 'textSize = 36f'),
    ('maxLines = 5\n            setPadding(0, dp(2), 0, dp(4))', 'maxLines = 5\n            setAutoSizeTextTypeUniformWithConfiguration(18, 36, 1, TypedValue.COMPLEX_UNIT_SP)\n            setPadding(0, dp(1), 0, dp(2))'),
    ('topMargin = dp(13)', 'topMargin = dp(10)'),
    ('LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(14) }', 'LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(10) }'),
    ('width = 0; height = dp(59); setMargins(dp(4), dp(4), dp(4), dp(4))', 'width = 0; height = dp(54); setMargins(dp(4), dp(3), dp(4), dp(3))'),
    ('topMargin = dp(8) })\n\n        setScreen(scroll(c), 0)', 'topMargin = dp(5) })\n\n        setScreen(scroll(c), 0)'),
]
for old, new in replacements:
    if old not in s:
        raise SystemExit(f'MainActivity polish anchor missing: {old[:80]!r}')
    s = s.replace(old, new, 1)

quick = '''        val quickRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }\n        quickRow.addView(glassButton("Smart examples", tint = VxColor.VIOLET, emphasis = .18f, quiet = true) {\n            showTools()\n        }, LinearLayout.LayoutParams(0, dp(48), 1f).apply { marginEnd = dp(6) })\n        quickRow.addView(glassButton("Graph it", tint = VxColor.CYAN, emphasis = .18f, quiet = true) {\n            val q = input.text.toString().trim()\n            showGraph(q.takeIf { it.isNotBlank() })\n        }, LinearLayout.LayoutParams(0, dp(48), 1f).apply { marginStart = dp(6) })\n        c.addView(quickRow, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })\n'''
if quick not in s:
    raise SystemExit('MainActivity quick-row anchor missing')
s = s.replace(quick, '        // Advanced destinations remain one tap away in the persistent floating navigation.\n', 1)
main.write_text(s)

s = ui.read_text()
ui_replacements = [
    ('addView(selector, LayoutParams(0, context.dp(46)))', 'addView(selector, LayoutParams(0, context.dp(42)))'),
    ('textSize = 12.5f\n                setOnClickListener { select(index) }', 'textSize = 10.5f\n                minWidth = 0\n                minHeight = 0\n                maxLines = 1\n                setPadding(context.dp(2), 0, context.dp(2), 0)\n                setOnClickListener { select(index) }'),
    ('row.addView(button, LinearLayout.LayoutParams(0, context.dp(50),1f))', 'row.addView(button, LinearLayout.LayoutParams(0, context.dp(46),1f))'),
    ('lp.height = context.dp(46)', 'lp.height = context.dp(42)'),
]
for old, new in ui_replacements:
    if old not in s:
        raise SystemExit(f'VeltrixUi polish anchor missing: {old[:80]!r}')
    s = s.replace(old, new, 1)
ui.write_text(s)
print('Frontend polish patch applied')
