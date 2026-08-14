#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


registry = ROOT / "core/src/main/kotlin/com/veltrix/calculator/core/ToolRegistry.kt"
replace_once(
    registry,
    "const val EXPECTED_V4_TOOLS = VERIFIED_BACKEND_1_1_TOOLS + V4Catalog.EXPECTED_ADDITIONS",
    "const val EXPECTED_V4_TOOLS = VERIFIED_BACKEND_1_1_TOOLS + V4Catalog.EXPECTED_ADDITIONS + Grade8PhysicsCatalog.EXPECTED_ADDITIONS",
)
replace_once(
    registry,
    "val tools = (baseline + V4Catalog.tools()).map(::normalizeMetadata)",
    "val tools = (baseline + V4Catalog.tools() + Grade8PhysicsCatalog.tools()).map(::normalizeMetadata)",
)

contract = ROOT / "core/src/test/kotlin/com/veltrix/calculator/core/V4CatalogContractTest.kt"
replace_once(
    contract,
    'assertEquals(25, grade8.size, "Grade 8 Physics hard-gate inventory drift")',
    'assertEquals(25 + Grade8PhysicsCatalog.EXPECTED_ADDITIONS, grade8.size, "Grade 8 Physics hard-gate inventory drift")',
)
replace_once(
    contract,
    "V4Catalog.tools().forEach { raw ->",
    "(V4Catalog.tools() + Grade8PhysicsCatalog.tools()).forEach { raw ->",
)
replace_once(
    contract,
    'if (tool.id == "physics-g9-critical-angle") {',
    '''if (tool.id == "physics-g8-transformer-efficiency") {
            if (field.id == "eta") return 80.0
            if (field.id == "Vp") return 10.0
            if (field.id == "Ip") return 2.0
            if (field.id == "Vs") return 8.0
            if (field.id == "Is") return 2.0
        }
        if (tool.id == "physics-g9-critical-angle") {''',
)

catalog = ROOT / "core/src/main/kotlin/com/veltrix/calculator/core/V4Catalog.kt"
text = catalog.read_text(encoding="utf-8")
charge_old = 'canonicalUnit = "C"'
charge_count = text.count(charge_old)
if charge_count < 1:
    raise SystemExit("V4Catalog: expected charge canonical-unit entries")
text = text.replace(charge_old, 'canonicalUnit = "coulomb", unitCategory = "Charge"')

# V4 currently has one unbounded Grade-8 capacitance field and three bounded
# capacitance fields (Grade 8 capacitor energy, Grade 11 LC resonance and Xc).
# All four are capacitance semantics; Fahrenheit is a distinct Temperature alias.
cap_plain = 'InputFieldDefinition("C", "Capacitance", canonicalUnit = "F")'
cap_bounded = 'InputFieldDefinition("C", "Capacitance", canonicalUnit = "F", min = 0.0, allowNegative = false)'
plain_count = text.count(cap_plain)
bounded_count = text.count(cap_bounded)
if plain_count != 1 or bounded_count != 3:
    raise SystemExit(
        f"V4Catalog: capacitance canonical-unit shape drift plain={plain_count} bounded={bounded_count}"
    )
text = text.replace(
    cap_plain,
    'InputFieldDefinition("C", "Capacitance", canonicalUnit = "farad", unitCategory = "Capacitance")',
)
text = text.replace(
    cap_bounded,
    'InputFieldDefinition("C", "Capacitance", canonicalUnit = "farad", unitCategory = "Capacitance", min = 0.0, allowNegative = false)',
)
catalog.write_text(text, encoding="utf-8")
