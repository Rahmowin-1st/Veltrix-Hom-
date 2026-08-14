# Veltrix Calculator V4 — Curriculum Source Map

Status: ACTIVE RESEARCH MAP
Authority order: Founder V4 mission -> official/government curriculum/textbook sources -> repository evidence -> secondary sources only when primary material is unavailable.

| key | scope | source | evidence used | status |
|---|---|---|---|---|
| `V4_ORIGINAL_MISSION` | Product acceptance | `Veltrix_Calculator_Backend_Product_Reset_V4_BACKEND_ONLY_FROM_1_1.txt` from the supplied V4 pack | Full mission, including Grade 8 hard gate and required research-map schema | AUTHORITATIVE PRODUCT SPEC |
| `UZB_G8_OFFICIAL_TEXTBOOK_INDEX_2020` | Grade 8 Physics | https://old.eduportal.uz/Eduportal/batafsil1/17?menu=33 | Ministry education portal lists Grade 8 `Fizika` electronic textbook variants | PRIMARY INDEX |
| `UZB_G8_OFFICIAL_LABS_2020` | Grade 8 Physics | https://old.eduportal.uz/eduportal/batafsil/69?menu=13 | Official Grade 8 labs explicitly cover circuit current/voltage, rheostat current control, conductor resistance and transformer study | PRIMARY SUPPORT |
| `UZB_G8_OFFICIAL_DIODE_LAB_2020` | Grade 8 Physics | https://old.eduportal.uz/eduportal/batafsil/104?menu=17 | Official Grade 8 semiconductor-diode rectification lab | PRIMARY SUPPORT |
| `UZB_G9_OFFICIAL_TEXTBOOK_INDEX_2020` | Grade 9 Physics | https://old.eduportal.uz/Eduportal/batafsil1/18?menu=33 | Ministry education portal lists Grade 9 `Fizika` textbook | PRIMARY INDEX; FULL MAP PENDING |
| `UZB_G10_OFFICIAL_TEXTBOOK_INDEX_2018_2020` | Grade 10 Physics | https://old.eduportal.uz/Eduportal/batafsil1/11?menu=33 | Ministry education portal lists Grade 10 `Fizika` textbook | PRIMARY INDEX; FULL MAP PENDING |

## Grade 8 interpretation rule

The V4 mission itself fixes the hard-gate Grade 8 scope: electrostatics; DC current; current in media; magnetism; electromagnetic induction/transformers. The official portal confirms the Grade 8 Physics textbook and practical work in the same electrical/transformer/semiconductor domain. The code map therefore implements every formula-capable relation explicitly enumerated by the mission and records conceptual-only or topology-dependent items instead of inventing a numeric model.

## Deliberate non-formula boundaries

- Semiconductor diode rectification is confirmed as a Grade 8 lab, but the mission requires only meaningful calculators. A generic diode I–V calculator would require device/model parameters not supplied by the curriculum; no values are guessed.
- Lenz-law direction is conceptual/sign reasoning. The numeric Faraday relation keeps the induced-EMF sign; a standalone direction calculator is not represented as a fake numeric formula.
- Arbitrary mixed resistor/capacitor networks are topology problems. V4 exposes deterministic fixed mixed topologies plus primitive series/parallel relations; arbitrary networks remain outside a single closed-form relation.
- Source EMF/internal resistance and solenoid/electromagnet numeric relations are not promoted merely from general physics knowledge. They require explicit curriculum confirmation before becoming Grade 8 hard-gate tools.

Accessed/re-checked: 2026-08-14.
