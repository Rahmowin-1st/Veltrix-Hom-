# Standalone Converter Platform

`ConversionRegistry` is independent of the Library Registry.

Categories include Length, Area, Volume, Mass, Temperature, Speed, Pressure, Power, Energy, Force, Torque, Density, Acceleration, Data/Storage, Angle, Time, Frequency, Current, Voltage, Resistance, Charge, Capacitance and Inductance.

Properties:
- bidirectional affine conversion (`base = value*scale + offset`)
- category-safe resolution
- aliases may map to multiple candidates and are disambiguated by compatible category (prevents `C` Celsius/Coulomb and `F` Fahrenheit/Farad collisions)
- offset-safe temperature conversion
- finite-number validation
- deterministic precision delegated to output settings
- A→B→A randomized property tests across compatible categories

Currency is a live-data subsystem and is not mixed into deterministic physical unit conversion math.
