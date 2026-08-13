# Graph Platform Capabilities

`GraphPlatform` is independent from visual rendering.

Supported structured conics: line, parabola, circle, ellipse, horizontal/vertical hyperbola. Derived metadata includes applicable centers/vertices/axes/roots/intercepts/asymptotes/foci and stable expressions.

General function graphing supports multiple expressions/series, bounded viewport/sampling, point evaluation, root discovery, extrema approximation, intersections, and discontinuity segmentation. Sampling is bounded and non-finite/extreme values are not connected across invalid regions.

Frontend owns drawing, pan/zoom gestures, crosshair visuals and curve morph animation. Backend exposes deterministic points/segments/derived data and viewport contracts.
