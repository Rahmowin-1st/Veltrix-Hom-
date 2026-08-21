# Veltrix Calculator V4 — Converter Catalog VNext

Canonical source: `ConversionRegistry.default()`.

Deterministic categories:
- Length
- Area
- Volume
- Mass
- Temperature
- Speed
- Pressure
- Power
- Energy
- Force
- Torque
- Density
- Acceleration
- Data / Storage
- Angle
- Time
- Frequency
- Current
- Voltage
- Resistance
- Charge
- Capacitance
- Inductance

Contract:
- finite input/result guards;
- linear and affine/offset conversion;
- category-safe lookup;
- categoryless ambiguous aliases fail closed;
- exact case-sensitive canonical IDs may be used by `convert()`;
- Fahrenheit/Farad and Celsius/Coulomb collisions are disambiguated by contract;
- live Currency is a separate freshness-aware data subsystem.
