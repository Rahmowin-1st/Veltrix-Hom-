# Veltrix Calculator V4 — Library Catalog VNext

Materialized from exact registry parent `d3a6104b4caf062c6190dda11ce1d99b3da243a9`.
Registry metadata: `registrySchemaVersion	4`
Registry SHA-256: `f32bad70eee6e3273187c8ab7707e3a7dba8fa8071b99af0f4c5d659ee29bd12`
Actual tool count: **260**.

Canonical IDs are persistence/deep-link/history keys. Aliases are discovery-only.
Frontend must render metadata; it must not duplicate formulas or invent unsupported solve targets.

| toolId | name | subject | category | topic | formula | solve targets | source refs |
|---|---|---|---|---|---|---|---|
| age-calculator | Age Calculator | DATE_TIME | Dates | Age |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| arithmetic-sequence | Arithmetic Sequence | MATH | Algebra | Sequences |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| calculus-tool | Calculus Tool | MATH | Calculus | Differentiation and integration |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| chem-v4-calorimetry | Calorimetry | CHEMISTRY | Chemistry Expansion | Thermochemistry | q = m*c*dT | c,dT,m,q | OPENSTAX_CHEMISTRY_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| chem-v4-faraday-electrolysis | Faraday Electrolysis Mass | CHEMISTRY | Chemistry Expansion | Electrochemistry | m = I*t*M/(z*F) | I,M,m,t,z | OPENSTAX_CHEMISTRY_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| chem-v4-first-order-half-life | First-Order Reaction Half-Life | CHEMISTRY | Chemistry Expansion | Kinetics | t_half=ln(2)/k | k,t_half | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| chem-v4-first-order-rate | First-Order Reaction Rate | CHEMISTRY | Chemistry Expansion | Kinetics | rate = k*C | C,k,rate | OPENSTAX_CHEMISTRY_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| chem-v4-limiting-reagent | Two-Reactant Limiting Reagent | CHEMISTRY | Chemistry Expansion | Stoichiometry |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| chem-v4-mass-fraction | Mass Fraction | CHEMISTRY | Chemistry Expansion | Solutions | w=m_solute/m_solution | m_solute,m_solution,w | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| chem-v4-molality | Molality | CHEMISTRY | Chemistry Expansion | Solutions | b=n_solute/kg_solvent | b,kg,n | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| chem-v4-osmotic-pressure | Osmotic Pressure | CHEMISTRY | Chemistry Expansion | Solutions | Pi = M*R*T | M,Pi,T | OPENSTAX_CHEMISTRY_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| chem-v4-partial-pressure | Dalton Partial Pressure | CHEMISTRY | Chemistry Expansion | Gas mixtures | Pi = xi*Ptotal | Pi,Ptotal,xi | OPENSTAX_CHEMISTRY_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| chem-v4-particles-moles | Particles and Amount of Substance | CHEMISTRY | Chemistry Expansion | Amount of substance | N = n*NA | N,n | OPENSTAX_CHEMISTRY_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| chem-v4-percent-yield | Percent Yield | CHEMISTRY | Chemistry Expansion | Stoichiometry | yield=actual/theoretical*100 | actual,theoretical,yield | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| chem-v4-ph | pH from Hydrogen Ion Concentration | CHEMISTRY | Chemistry Expansion | Acid-base | pH=-log10(H) | H,pH | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| chem-v4-ph-poh | pH and pOH Relation | CHEMISTRY | Chemistry Expansion | Acid-base | pH + pOH = 14 | pH,pOH | OPENSTAX_CHEMISTRY_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| chem-v4-poh | pOH from Hydroxide Concentration | CHEMISTRY | Chemistry Expansion | Acid-base | pOH = -log10(OH) | OH,pOH | OPENSTAX_CHEMISTRY_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| chemistry-dilution | Dilution | CHEMISTRY | Chemistry | Solutions | C1*V1 = C2*V2 | C1,C2,V1,V2 | BACKEND_1_1_VERIFIED_BASELINE |
| chemistry-ideal-gas | Ideal Gas Law | CHEMISTRY | Chemistry | Gases | P*V = n*R*T | P,T,V,n | BACKEND_1_1_VERIFIED_BASELINE |
| chemistry-mass-moles | Mass ↔ Moles | CHEMISTRY | Chemistry | Amount of Substance | n = m/M | M,m,n | BACKEND_1_1_VERIFIED_BASELINE |
| chemistry-molarity | Molarity | CHEMISTRY | Chemistry | Solutions | C = n/V | C,V,n | BACKEND_1_1_VERIFIED_BASELINE |
| chemistry-solution-density | Solution Density | CHEMISTRY | Chemistry | Solutions | rho = m/V | V,m,rho | BACKEND_1_1_VERIFIED_BASELINE |
| chemistry-stoichiometric-ratio | Stoichiometric Mole Ratio | CHEMISTRY | Chemistry | Stoichiometry | n2 = n1*c2/c1 | n1,n2 | BACKEND_1_1_VERIFIED_BASELINE |
| complex-calculator | Complex Number Calculator | MATH | Complex Numbers | Complex arithmetic |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| computer-v4-checksum | UTF-8 Bytes and Checksums | COMPUTER | Computer Expansion | Encoding |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| computer-v4-pixel-buffer | Pixel Buffer Size | COMPUTER | Computer Expansion | Graphics | bytes=width*height*bpp/8 | bpp,bytes,height,width | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| computer-v4-storage-overhead | Storage Overhead | COMPUTER | Computer Expansion | Storage | total=payload*(1+overhead) | overhead,payload,total | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| computer-v4-transfer-time | Data Transfer Time | COMPUTER | Computer Expansion | Networking | time=bytes*8/bps | bps,bytes,time | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| coordinate-distance | Point Distance | GEOMETRY | Coordinate Geometry | Points |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| coordinate-midpoint | Midpoint | GEOMETRY | Coordinate Geometry | Points |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| cubic-solver | Cubic Equation Solver | MATH | Algebra | Cubic equations |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| date-add-duration | Add / Subtract Duration | DATE_TIME | Dates | Calendar arithmetic |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| date-difference | Date Difference | DATE_TIME | Dates | Intervals |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| date-v4-business-days | Business Days | DATE_TIME | Date & Time Expansion | Calendar |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| date-v4-duration-decompose | Duration Decomposition | DATE_TIME | Date & Time Expansion | Durations |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| date-v4-duration-hours | Duration Hours | DATE_TIME | Date / Time Expansion | Durations | hours=seconds/3600 | hours,seconds | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| date-v4-epoch-seconds | Epoch Milliseconds / Seconds | DATE_TIME | Date / Time Expansion | Epoch | milliseconds=seconds*1000 | milliseconds,seconds | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| date-v4-timezone-convert | Timezone Conversion | DATE_TIME | Date & Time Expansion | Time zones |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| date-v4-unix-timestamp | Unix Timestamp | DATE_TIME | Date & Time Expansion | Unix time |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| date-v4-weekday | Weekday | DATE_TIME | Date & Time Expansion | Calendar |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| discriminant | Discriminant | MATH | Algebra | Quadratic equations | Δ = b² - 4ac | discriminant | BACKEND_1_1_VERIFIED_BASELINE |
| finance-compound-interest | Compound Interest | FINANCE | Finance | Interest | A = P*(1+r/(100*n))^(n*t) | A,P | BACKEND_1_1_VERIFIED_BASELINE |
| finance-discount | Discount | FINANCE | Finance | Shopping Math | final = price*(1-discount/100) | discount,final,price | BACKEND_1_1_VERIFIED_BASELINE |
| finance-margin | Margin | FINANCE | Finance | Business Math | margin% = (revenue-cost)/revenue*100 | cost,margin,revenue | BACKEND_1_1_VERIFIED_BASELINE |
| finance-markup | Markup | FINANCE | Finance | Business Math | price = cost*(1+markup/100) | cost,markup,price | BACKEND_1_1_VERIFIED_BASELINE |
| finance-percentage-change | Percentage Change | FINANCE | Finance | Percentages | change% = (new-old)/old*100 | change,new,old | BACKEND_1_1_VERIFIED_BASELINE |
| finance-simple-interest | Simple Interest | FINANCE | Finance | Interest | A = P*(1+r*t/100) | A,P,r,t | BACKEND_1_1_VERIFIED_BASELINE |
| finance-tax | Tax | FINANCE | Finance | Shopping Math | total = subtotal*(1+rate/100) | rate,subtotal,total | BACKEND_1_1_VERIFIED_BASELINE |
| finance-tip | Tip | FINANCE | Finance | Everyday Finance | total = bill*(1+tip/100) | bill,tip,total | BACKEND_1_1_VERIFIED_BASELINE |
| finance-v4-amortization | Loan Amortization Schedule | FINANCE | Finance Expansion | Loans |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| finance-v4-break-even | Break-Even Units | FINANCE | Finance Expansion | Business | q = fixed/(price-variable) | fixed,price,q,variable | V4_DETERMINISTIC_FINANCE_DOMAIN_MAP\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| finance-v4-cagr | Compound Annual Growth Rate | FINANCE | Finance Expansion | Growth | CAGR=(end/start)^(1/years)-1 | CAGR,end,start | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| finance-v4-continuous-compounding | Continuous Compounding | FINANCE | Finance Expansion | Growth | A = P*exp(r*t) | A,P,r,t | V4_DETERMINISTIC_FINANCE_DOMAIN_MAP\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| finance-v4-effective-annual-rate | Effective Annual Rate | FINANCE | Finance Expansion | Rates | EAR = (1+apr/m)^m-1 | EAR,apr | V4_DETERMINISTIC_FINANCE_DOMAIN_MAP\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| finance-v4-future-value-annuity | Future Value of Ordinary Annuity | FINANCE | Finance Expansion | Annuities | FV=PMT*((1+r)^n-1)/r | FV,PMT | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| finance-v4-irr | Internal Rate of Return | FINANCE | Finance Expansion | Cash flow |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| finance-v4-npv | Net Present Value | FINANCE | Finance Expansion | Cash flow |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| finance-v4-present-value | Present Value | FINANCE | Finance Expansion | Time value | PV=FV/(1+r)^n | FV,PV,r | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| finance-v4-savings-growth | Savings Compound Growth | FINANCE | Finance Expansion | Savings | FV = P*(1+r)^n | FV,P,n,r | V4_DETERMINISTIC_FINANCE_DOMAIN_MAP\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| finance-v4-straight-line-depreciation | Straight-Line Depreciation | FINANCE | Finance Expansion | Depreciation | value = cost-(cost-salvage)*years/life | life,salvage,value,years | V4_DETERMINISTIC_FINANCE_DOMAIN_MAP\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| gcd-lcm | GCD / LCM | MATH | Arithmetic | Integers |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| geometric-sequence | Geometric Sequence | MATH | Algebra | Sequences |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-arc-length | Arc Length | GEOMETRY | Geometry | Circle | L = theta/360*2*pi*r | L,r,theta | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-circle-area | Circle Area | GEOMETRY | Geometry | Circle | A = pi*r² | A,r | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-circle-circumference | Circle Circumference | GEOMETRY | Geometry | Circle | C = 2*pi*r | C,r | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-cone-volume | Cone Volume | GEOMETRY | Geometry | Cone | V = pi*r²*h/3 | V,h,r | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-cube | Cube | GEOMETRY | Geometry | Cube | V = s³ | V,s | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-cuboid-volume | Cuboid Volume | GEOMETRY | Geometry | Cuboid | V = l*w*h | V,h,l,w | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-cylinder-volume | Cylinder Volume | GEOMETRY | Geometry | Cylinder | V = pi*r²*h | V,h,r | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-ellipse-area | Ellipse Area | GEOMETRY | Geometry | Ellipse | A = pi*a*b | A,a,b | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-heron-area | Heron's Formula | GEOMETRY | Geometry | Triangle | A = sqrt(s(s-a)(s-b)(s-c)) | A | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-parallelogram-area | Parallelogram Area | GEOMETRY | Geometry | Parallelogram | A = b*h | A,b,h | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-prism-volume | Prism Volume | GEOMETRY | Geometry | Prism | V = B*h | B,V,h | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-rectangle-area | Rectangle Area | GEOMETRY | Geometry | Rectangle | A = w*h | A,h,w | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-rectangle-perimeter | Rectangle Perimeter | GEOMETRY | Geometry | Rectangle | P = 2(w+h) | P,h,w | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-regular-polygon | Regular Polygon | GEOMETRY | Geometry | Polygon | P = n*s; A = n*s²/(4*tan(pi/n)) | A,P | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-rhombus-area | Rhombus Area | GEOMETRY | Geometry | Rhombus | A = d1*d2/2 | A,d1,d2 | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-right-triangle | Right Triangle | GEOMETRY | Geometry | Triangle | c² = a² + b² | a,b,c | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-sector-area | Sector Area | GEOMETRY | Geometry | Circle | A = theta/360*pi*r² | A,r,theta | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-sphere-volume | Sphere Volume | GEOMETRY | Geometry | Sphere | V = 4*pi*r³/3 | V,r | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-square | Square | GEOMETRY | Geometry | Square | A = s² | A,s | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-trapezoid-area | Trapezoid Area | GEOMETRY | Geometry | Trapezoid | A = (a+b)h/2 | A,a,b,h | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-triangle-area | Triangle Area | GEOMETRY | Geometry | Triangle | A = b*h/2 | A,b,h | BACKEND_1_1_VERIFIED_BASELINE |
| geometry-v4-annulus-area | Annulus Area | GEOMETRY | Geometry Expansion | Circles | A=pi*(R^2-r^2) | A,R,r | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| geometry-v4-cuboid-surface-area | Cuboid Surface Area | GEOMETRY | Geometry Expansion | Solids | A = 2*(l*w+l*h+w*h) | A,h,l,w | OPENSTAX_PRECALCULUS_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| geometry-v4-cylinder-surface-area | Cylinder Total Surface Area | GEOMETRY | Geometry Expansion | Solids | A = 2*pi*r*(r+h) | A,h,r | OPENSTAX_PRECALCULUS_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| geometry-v4-frustum-volume | Conical Frustum Volume | GEOMETRY | Geometry Expansion | Solids | V=pi*h*(R^2+R*r+r^2)/3 | V,h | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| geometry-v4-pyramid-volume | Pyramid Volume | GEOMETRY | Geometry Expansion | Solids | V=A_base*h/3 | A_base,V,h | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| geometry-v4-similarity-area | Similar-Figure Area Scale | GEOMETRY | Geometry Expansion | Similarity | A2 = A1*k^2 | A1,A2,k | OPENSTAX_PRECALCULUS_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| geometry-v4-similarity-length | Similar-Figure Length Scale | GEOMETRY | Geometry Expansion | Similarity | L2 = k*L1 | L1,L2,k | OPENSTAX_PRECALCULUS_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| geometry-v4-sphere-surface-area | Sphere Surface Area | GEOMETRY | Geometry Expansion | Solids | A=4*pi*r^2 | A,r | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| graph-circle | Circle Graph | MATH | Graphing | Circle |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| graph-ellipse | Ellipse Graph | MATH | Graphing | Ellipse |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| graph-functions | Graph | MATH | Graphing | Functions and conics |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| graph-hyperbola | Hyperbola Graph | MATH | Graphing | Hyperbola |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| graph-line | Line Graph | MATH | Graphing | Line |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| graph-parabola | Parabola | MATH | Graphing | Parabola |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| line-slope | Slope | GEOMETRY | Coordinate Geometry | Line |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| linear-equation | Linear Equation Solver | MATH | Algebra | Linear equations |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| linear-inequality | Linear Inequality Solver | MATH | Algebra | Inequalities |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| linear-system | System of Linear Equations | MATH | Algebra | Systems of equations |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| loan-payment | Loan Payment | FINANCE | Loans | Amortization |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| math-v4-distance-3d | 3D Distance | MATH | Math Expansion | Coordinate geometry | d=sqrt(dx^2+dy^2+dz^2) | d,dx,dy,dz | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| math-v4-exponential-growth | Exponential Growth | MATH | Math Expansion | Exponential | final=initial*(1+r)^t | final,initial,r | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| matrix-tool | Matrix Calculator | MATH | Linear Algebra | Matrices |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| mean | Mean | STATISTICS | Descriptive Statistics | Dataset |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| median | Median | STATISTICS | Descriptive Statistics | Dataset |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| mode | Mode | STATISTICS | Descriptive Statistics | Dataset |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| molar-mass | Molar Mass | CHEMISTRY | Amount of Substance | Chemical formulas |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| percent-composition | Percent Composition | CHEMISTRY | Composition | Chemical formulas |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| percentage-of | Percentage Of | MATH | Arithmetic | Percentages | result = percent/100 × value | percent,result,value | BACKEND_1_1_VERIFIED_BASELINE |
| percentile | Percentile / Quantile | STATISTICS | Descriptive Statistics | Quantiles |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| permutations-combinations | Permutations / Combinations | MATH | Probability | Combinatorics |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| physics-acceleration | Acceleration | PHYSICS | Physics | Motion | a = (v-u)/t | a,t,u,v | BACKEND_1_1_VERIFIED_BASELINE |
| physics-advanced-v4-buoyancy | Archimedes Buoyant Force | PHYSICS | Advanced Physics | Fluids | F = rho*g*V | F,V,rho | OPENSTAX_UNIVERSITY_PHYSICS\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-advanced-v4-continuity | Fluid Continuity Equation | PHYSICS | Advanced Physics | Fluids | A1*v1 = A2*v2 | A1,A2,v1,v2 | OPENSTAX_UNIVERSITY_PHYSICS\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-advanced-v4-hydrostatic-pressure | Hydrostatic Pressure | PHYSICS | Advanced Physics | Fluids | p = rho*g*h | h,p,rho | OPENSTAX_UNIVERSITY_PHYSICS\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-advanced-v4-relativity-gamma | Relativistic Lorentz Factor | PHYSICS | Advanced Physics | Relativity | gamma = 1/sqrt(1-v^2/c^2) | gamma,v | OPENSTAX_UNIVERSITY_PHYSICS\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-density | Density | PHYSICS | Physics | Mechanics | ρ = m/V | V,m,rho | BACKEND_1_1_VERIFIED_BASELINE |
| physics-electrical-power | Electrical Power | PHYSICS | Physics | Electricity | P = V*I | I,P,V | BACKEND_1_1_VERIFIED_BASELINE |
| physics-force | Force | PHYSICS | Physics | Mechanics | F = m*a | F,a,m | BACKEND_1_1_VERIFIED_BASELINE |
| physics-frequency-period | Frequency / Period | PHYSICS | Physics | Waves | f = 1/T | T,f | BACKEND_1_1_VERIFIED_BASELINE |
| physics-g10-centripetal-acceleration | Centripetal Acceleration | PHYSICS | Grade 10 Physics | Circular motion | ac=v^2/r | ac,r,v | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-centripetal-force | Centripetal Force | PHYSICS | Grade 10 Physics | Circular motion | Fc=m*v^2/r | Fc,m,r,v | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-friction | Friction Force | PHYSICS | Grade 10 Physics | Dynamics | Ff=mu*N | Ff,N,mu | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-gravitation | Universal Gravitation | PHYSICS | Grade 10 Physics | Gravitation | F=G*m1*m2/r^2 | F,m1,m2,r | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-hooke | Hooke's Law | PHYSICS | Grade 10 Physics | Elasticity | F=k*x | F,k,x | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-kinematics-displacement | Uniformly Accelerated Displacement | PHYSICS | Grade 10 Physics | Kinematics | s=v0*t+a*t^2/2 | a,s,v0 | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-kinematics-no-time | Kinematics Without Time | PHYSICS | Grade 10 Physics | Kinematics | v^2=v0^2+2*a*s | a,s,v,v0 | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-kinematics-velocity | Uniformly Accelerated Velocity | PHYSICS | Grade 10 Physics | Kinematics | v=v0+a*t | a,t,v,v0 | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-mechanical-efficiency | Mechanical Efficiency | PHYSICS | Grade 10 Physics | Work and power | eta=useful/input*100 | eta,input,useful | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-momentum-collision | One-Dimensional Momentum Conservation | PHYSICS | Grade 10 Physics | Momentum | m1*u1+m2*u2=m1*v1+m2*v2 | u1,u2,v1,v2 | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-newton-second | Newton's Second Law | PHYSICS | Grade 10 Physics | Dynamics | F=m*a | F,a,m | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-orbital-speed | Circular Orbital Speed | PHYSICS | Grade 10 Physics | Gravitation | v=sqrt(G*M/r) | M,r,v | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-projectile-height | Projectile Maximum Height | PHYSICS | Grade 10 Physics | Projectile motion | H=v0^2*sin(theta)^2/(2*g) | H,g,v0 | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-projectile-range | Projectile Range | PHYSICS | Grade 10 Physics | Projectile motion | R=v0^2*sin(2*theta)/g | R,g,theta,v0 | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-spring-energy | Elastic Potential Energy | PHYSICS | Grade 10 Physics | Elasticity | U=k*x^2/2 | U,k,x | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g10-v4-angular-momentum | Angular Momentum | PHYSICS | Grade 10 Physics | Rotation | L = I*omega | I,L,omega | UZB_G10_OFFICIAL_TEXTBOOK_INDEX\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g10-v4-angular-power | Rotational Power | PHYSICS | Grade 10 Physics | Rotation | P = tau*omega | P,omega,tau | UZB_G10_OFFICIAL_TEXTBOOK_INDEX\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g10-v4-angular-speed | Tangential and Angular Speed | PHYSICS | Grade 10 Physics | Rotation | v = omega*r | omega,r,v | UZB_G10_OFFICIAL_TEXTBOOK_INDEX\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g10-v4-rotational-ke | Rotational Kinetic Energy | PHYSICS | Grade 10 Physics | Rotation | K = I*omega^2/2 | I,K,omega | UZB_G10_OFFICIAL_TEXTBOOK_INDEX\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g10-v4-rotational-torque | Rotational Dynamics | PHYSICS | Grade 10 Physics | Rotation | tau = I*alpha | I,alpha,tau | UZB_G10_OFFICIAL_TEXTBOOK_INDEX\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g10-weight | Weight | PHYSICS | Grade 10 Physics | Dynamics | W=m*g | W,g,m | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-binding-energy | Nuclear Binding Energy from Mass Defect | PHYSICS | Advanced Physics | Nuclear physics | E=dm*c^2 | E,dm | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-capacitive-reactance | Capacitive Reactance | PHYSICS | Grade 11 Physics | AC circuits | Xc=1/(2*pi*f*C) | C,Xc,f | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-de-broglie | de Broglie Wavelength | PHYSICS | Advanced Physics | Quantum physics | lambda=h/p | lambda,p | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-em-wave | Electromagnetic Wave Relation | PHYSICS | Grade 11 Physics | Electromagnetic waves | c=f*lambda | f,lambda | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-half-life | Half-Life and Decay Constant | PHYSICS | Advanced Physics | Nuclear physics | T_half=ln(2)/lambda | T_half,lambda | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-inductive-reactance | Inductive Reactance | PHYSICS | Grade 11 Physics | AC circuits | Xl=2*pi*f*L | L,Xl,f | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-inductor-energy | Inductor Energy | PHYSICS | Grade 11 Physics | Electromagnetism | U=L*I^2/2 | I,L,U | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-lc-resonance | LC Resonance | PHYSICS | Grade 11 Physics | Oscillations | f=1/(2*pi*sqrt(L*C)) | C,L,f | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-mass-energy | Mass–Energy Equivalence | PHYSICS | Advanced Physics | Relativity | E=m*c^2 | E,m | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-pendulum | Simple Pendulum Period | PHYSICS | Grade 11 Physics | Oscillations | T=2*pi*sqrt(L/g) | L,T,g | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-photoelectric | Photoelectric Maximum Kinetic Energy | PHYSICS | Advanced Physics | Quantum physics | Kmax=h*f-phi | Kmax,f,phi | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-photon-energy | Photon Energy | PHYSICS | Advanced Physics | Quantum physics | E=h*f | E,f | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-radioactive-decay | Radioactive Decay | PHYSICS | Advanced Physics | Nuclear physics | N=N0*exp(-lambda*t) | N,N0,lambda,t | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-rms-voltage | Sinusoidal RMS Voltage | PHYSICS | Grade 11 Physics | AC circuits | Vrms=Vpeak/sqrt(2) | Vpeak,Vrms | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-spring-shm | Spring Oscillator Period | PHYSICS | Grade 11 Physics | Oscillations | T=2*pi*sqrt(m/k) | T,k,m | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g11-v4-magnetic-charge-force | Magnetic Force on Moving Charge | PHYSICS | Grade 11 Physics | Magnetism | F = q*v*B | B,F,q,v | UZB_G11_OFFICIAL_CURRICULUM\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g11-v4-magnetic-wire-force | Magnetic Force on Current-Carrying Wire | PHYSICS | Grade 11 Physics | Magnetism | F = B*I*L | B,F,I,L | UZB_G11_OFFICIAL_CURRICULUM\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g11-v4-photon-momentum | Photon Momentum | PHYSICS | Grade 11 Physics | Quantum physics | p = h/lambda | lambda,p | UZB_G11_OFFICIAL_CURRICULUM\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g11-v4-radioactive-activity | Radioactive Activity | PHYSICS | Grade 11 Physics | Nuclear physics | A = lambda*N | A,N,lambda | UZB_G11_OFFICIAL_CURRICULUM\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g8-capacitance | Capacitance | PHYSICS | Grade 8 Physics | Capacitors | C = Q/V | C,Q,V | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-capacitor-energy | Capacitor Energy | PHYSICS | Grade 8 Physics | Capacitors | U = C*V^2/2 | C,U,V | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-capacitors-mixed-series-parallel | Mixed Capacitors: C1 Parallel (C2 Series C3) | PHYSICS | Grade 8 Physics | Capacitor combinations | Ceq = C1 + C2*C3/(C2+C3) | C1,C2,C3,Ceq | UZB_G8_OFFICIAL_PORTAL_2020\|V4_GRADE8_FULL_MAP\|V4_ORIGINAL_MISSION |
| physics-g8-capacitors-parallel-two | Parallel Capacitors (Two) | PHYSICS | Grade 8 Physics | Capacitor combinations | Ceq = C1+C2 | C1,C2,Ceq | UZB_G8_OFFICIAL_PORTAL_2020\|V4_GRADE8_FULL_MAP\|V4_ORIGINAL_MISSION |
| physics-g8-capacitors-series-two | Series Capacitors (Two) | PHYSICS | Grade 8 Physics | Capacitor combinations | Ceq = C1*C2/(C1+C2) | C1,C2,Ceq | UZB_G8_OFFICIAL_PORTAL_2020\|V4_GRADE8_FULL_MAP\|V4_ORIGINAL_MISSION |
| physics-g8-charge-conservation | Charge Conservation | PHYSICS | Grade 8 Physics | Charge conservation | Qfinal = Qinitial + Qtransfer | Qfinal,Qinitial,Qtransfer | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-charge-quantization | Charge Quantization | PHYSICS | Grade 8 Physics | Electric charge | q = n*e | n,q | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-charged-particle-radius | Charged Particle Radius in Magnetic Field | PHYSICS | Grade 8 Physics | Magnetic field | r = m*v/(\|q\|*B) | B,m,r,v | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-coulomb | Coulomb Force | PHYSICS | Grade 8 Physics | Electrostatics | F = k*\|q1*q2\|/r^2 | F,q1,q2,r | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-current-charge-time | Electric Current | PHYSICS | Grade 8 Physics | Current | I = Q/t | I,Q,t | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-current-divider-two | Current Divider (Two Branches) | PHYSICS | Grade 8 Physics | Circuit current | I1 = It*R2/(R1+R2) | I1,It,R1,R2 | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-efficiency | Electrical Efficiency | PHYSICS | Grade 8 Physics | Efficiency | eta = useful/input*100 | eta,input,useful | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-electric-field | Electric Field Strength | PHYSICS | Grade 8 Physics | Electric field | E = F/q | E,F,q | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-electric-potential-work | Electric Potential / Work | PHYSICS | Grade 8 Physics | Electric potential | V = W/q | V,W,q | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-electric-power-vi | Electric Power | PHYSICS | Grade 8 Physics | Electrical work and power | P = V*I | I,P,V | UZB_G8_OFFICIAL_PORTAL_2020\|V4_GRADE8_FULL_MAP\|V4_ORIGINAL_MISSION |
| physics-g8-electrical-energy | Electrical Energy / Power / Time | PHYSICS | Grade 8 Physics | Electrical work and power | E = P*t | E,P,t | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-electrolysis-faraday | Electrolysis / Faraday Relation | PHYSICS | Grade 8 Physics | Current in media | m = k*I*t | I,k,m,t | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-faraday | Faraday Induction | PHYSICS | Grade 8 Physics | Electromagnetic induction | emf = -N*dPhi/dt | N,dPhi,dt,emf | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-joule-lenz | Joule–Lenz Heat | PHYSICS | Grade 8 Physics | Electrical heating | Q = I^2*R*t | I,Q,R,t | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-lorentz-force | Lorentz Magnetic Force | PHYSICS | Grade 8 Physics | Magnetic field | F = q*v*B*sin(theta) | B,F,q,v | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-magnetic-flux | Magnetic Flux | PHYSICS | Grade 8 Physics | Electromagnetic phenomena | Phi = B*A*cos(theta) | A,B,Phi | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-magnetic-force-wire | Ampere Force on a Current-Carrying Wire | PHYSICS | Grade 8 Physics | Magnetic field | F = B*I*L*sin(theta) | B,F,I,L | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-mixed-resistance-series-parallel | Mixed Resistors: R1 Series (R2 Parallel R3) | PHYSICS | Grade 8 Physics | Circuit combinations | Req = R1 + R2*R3/(R2+R3) | R1,R2,R3,Req | UZB_G8_OFFICIAL_PORTAL_2020\|V4_GRADE8_FULL_MAP\|V4_ORIGINAL_MISSION |
| physics-g8-ohms-law | Ohm's Law | PHYSICS | Grade 8 Physics | DC electric current | V = I*R | I,R,V | UZB_G8_OFFICIAL_PORTAL_2020\|V4_GRADE8_FULL_MAP\|V4_ORIGINAL_MISSION |
| physics-g8-parallel-resistance-two | Parallel Resistance (Two Resistors) | PHYSICS | Grade 8 Physics | Circuit combinations | Req = R1*R2/(R1+R2) | R1,R2,Req | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-point-charge-field | Point Charge Electric Field | PHYSICS | Grade 8 Physics | Electric field | E = k*\|Q\|/r^2 | E,Q,r | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-resistivity | Resistance and Resistivity | PHYSICS | Grade 8 Physics | Resistance | R = rho*L/A | A,L,R,rho | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-series-resistance | Series Resistance | PHYSICS | Grade 8 Physics | Circuit combinations | Req = R1 + R2 | R1,R2,Req | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-transformer-current | Ideal Transformer Current Ratio | PHYSICS | Grade 8 Physics | Transformers | Is/Ip = Np/Ns | Ip,Is,Np,Ns | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-transformer-efficiency | Transformer Efficiency | PHYSICS | Grade 8 Physics | Transformers | eta = Vs*Is/(Vp*Ip)*100 | Ip,Is,Vp,Vs,eta | UZB_G8_OFFICIAL_PORTAL_2020\|V4_GRADE8_FULL_MAP\|V4_ORIGINAL_MISSION |
| physics-g8-transformer-ideal-power | Ideal Transformer Power Conservation | PHYSICS | Grade 8 Physics | Transformers | Vp*Ip = Vs*Is | Ip,Is,Vp,Vs | UZB_G8_OFFICIAL_PORTAL_2020\|V4_GRADE8_FULL_MAP\|V4_ORIGINAL_MISSION |
| physics-g8-transformer-voltage | Ideal Transformer Voltage Ratio | PHYSICS | Grade 8 Physics | Transformers | Vs/Vp = Ns/Np | Np,Ns,Vp,Vs | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g8-voltage-divider | Voltage Divider | PHYSICS | Grade 8 Physics | Circuit voltage | Vout = Vin*R2/(R1+R2) | R1,R2,Vin,Vout | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-boyle | Boyle's Law | PHYSICS | Grade 9 Physics | Gas laws | P1*V1=P2*V2 | P1,P2,V1,V2 | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-calorimetry-balance | Calorimetry Balance | PHYSICS | Grade 9 Physics | Heat balance | m1*c1*(Tf-T1)+m2*c2*(Tf-T2)=0 | Tf | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-capillary-rise | Capillary Rise | PHYSICS | Grade 9 Physics | Fluids | h=2*gamma*cos(theta)/(rho*g*r) | gamma,h,r | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-charles | Charles's Law | PHYSICS | Grade 9 Physics | Gas laws | V1/T1=V2/T2 | T1,T2,V1,V2 | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-combined-gas | Combined Gas Law | PHYSICS | Grade 9 Physics | Gas laws | P1*V1/T1=P2*V2/T2 | P1,P2,T1,T2,V1,V2 | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-critical-angle | Critical Angle | PHYSICS | Grade 9 Physics | Optics | thetaC=asin(n2/n1) | n1,n2,thetaC | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-frequency-wavelength | Wave Speed, Frequency and Wavelength | PHYSICS | Grade 9 Physics | Waves | v=f*lambda | f,lambda,v | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-latent-heat | Latent Heat | PHYSICS | Grade 9 Physics | Phase change | Q = m*L | L,Q,m | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-lens-magnification | Lens Magnification | PHYSICS | Grade 9 Physics | Optics | M=-di/do | M,di,do | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-lens-power | Lens Power | PHYSICS | Grade 9 Physics | Optics | P=1/f | P,f | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-linear-expansion | Linear Thermal Expansion | PHYSICS | Grade 9 Physics | Thermal expansion | dL = alpha*L0*dT | L0,alpha,dL,dT | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-refractive-index-speed | Refractive Index and Light Speed | PHYSICS | Grade 9 Physics | Optics | n=c/v | n,v | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-snell | Snell's Law | PHYSICS | Grade 9 Physics | Optics | n1*sin(theta1)=n2*sin(theta2) | n1,n2,theta1,theta2 | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-surface-tension | Surface Tension Force | PHYSICS | Grade 9 Physics | Fluids | F=gamma*L | F,L,gamma | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-g9-v4-first-law | First Law of Thermodynamics | PHYSICS | Grade 9 Physics | Thermodynamics | dU = Q - W | Q,W,dU | UZB_G9_OFFICIAL_TEXTBOOK_AND_LABS\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g9-v4-gay-lussac | Gay-Lussac Pressure–Temperature Law | PHYSICS | Grade 9 Physics | Gas laws | P1/T1 = P2/T2 | P1,P2,T1,T2 | UZB_G9_OFFICIAL_TEXTBOOK_AND_LABS\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g9-v4-heat-engine-efficiency | Heat Engine Efficiency | PHYSICS | Grade 9 Physics | Thermodynamics | eta = W/Qh*100 | Qh,W,eta | UZB_G9_OFFICIAL_TEXTBOOK_AND_LABS\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g9-v4-mirror-equation | Spherical Mirror Equation | PHYSICS | Grade 9 Physics | Geometric optics | 1/f = 1/do + 1/di | di,do,f | UZB_G9_OFFICIAL_TEXTBOOK_AND_LABS\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g9-v4-sound-level | Sound Intensity Level | PHYSICS | Grade 9 Physics | Sound | beta = 10*log10(I/1e-12) | I,beta | UZB_G9_OFFICIAL_TEXTBOOK_AND_LABS\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| physics-g9-wave-period | Wave Period and Frequency | PHYSICS | Grade 9 Physics | Waves | T=1/f | T,f | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| physics-heat-energy | Heat Energy | PHYSICS | Physics | Thermal | Q = m*c*dT | Q,c,dT,m | BACKEND_1_1_VERIFIED_BASELINE |
| physics-ideal-lens | Thin Lens | PHYSICS | Physics | Optics | 1/f = 1/do + 1/di | di,do,f | BACKEND_1_1_VERIFIED_BASELINE |
| physics-impulse | Impulse | PHYSICS | Physics | Mechanics | J = F*t | F,J,t | BACKEND_1_1_VERIFIED_BASELINE |
| physics-kinetic-energy | Kinetic Energy | PHYSICS | Physics | Energy | KE = 0.5*m*v² | KE,m,v | BACKEND_1_1_VERIFIED_BASELINE |
| physics-momentum | Momentum | PHYSICS | Physics | Mechanics | p = m*v | m,p,v | BACKEND_1_1_VERIFIED_BASELINE |
| physics-ohms-law | Ohm's Law | PHYSICS | Physics | Electricity | V = I*R | I,R,V | BACKEND_1_1_VERIFIED_BASELINE |
| physics-potential-energy | Gravitational Potential Energy | PHYSICS | Physics | Energy | PE = m*g*h | PE,g,h,m | BACKEND_1_1_VERIFIED_BASELINE |
| physics-power-work-time | Power | PHYSICS | Physics | Energy | P = W/t | P,W,t | BACKEND_1_1_VERIFIED_BASELINE |
| physics-pressure | Pressure | PHYSICS | Physics | Mechanics | p = F/A | A,F,p | BACKEND_1_1_VERIFIED_BASELINE |
| physics-speed | Speed / Distance / Time | PHYSICS | Physics | Motion | v = d/t | d,t,v | BACKEND_1_1_VERIFIED_BASELINE |
| physics-torque | Torque | PHYSICS | Physics | Rotation | τ = F*r | F,r,tau | BACKEND_1_1_VERIFIED_BASELINE |
| physics-wave-speed | Wave Speed | PHYSICS | Physics | Waves | v = f*lambda | f,lambda,v | BACKEND_1_1_VERIFIED_BASELINE |
| physics-work | Work | PHYSICS | Physics | Energy | W = F*d | F,W,d | BACKEND_1_1_VERIFIED_BASELINE |
| polynomial-division | Polynomial Division | MATH | Algebra | Polynomials |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| polynomial-roots | Polynomial Roots | MATH | Algebra | Polynomials |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| prime-factorization | Prime Factorization | MATH | Arithmetic | Integers |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| programmer-calculator | Programmer Calculator | COMPUTER | Programmer | Integer bases and bitwise operations |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| quadratic-solver | Quadratic Equation Solver | MATH | Algebra | Quadratic equations |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| quartic-solver | Quartic Equation Solver | MATH | Algebra | Quartic equations |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| range | Range | STATISTICS | Descriptive Statistics | Dataset |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| ratio-proportion | Proportion Solver | MATH | Arithmetic | Ratios and proportions | a/b = c/d | a,b,c,d | BACKEND_1_1_VERIFIED_BASELINE |
| scientific-calculator | Scientific Calculator | MATH | Scientific | Scientific calculation |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| split-bill | Split Bill | FINANCE | Everyday Finance | Bill sharing |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| standard-calculator | Standard Calculator | MATH | Arithmetic | General calculation |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| standard-deviation | Standard Deviation | STATISTICS | Descriptive Statistics | Dataset |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| statistics-dataset | Statistics Dataset | STATISTICS | Descriptive Statistics | Dataset summaries |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| stats-v4-binomial-mean | Binomial Mean | STATISTICS | Statistics Expansion | Probability | mu=n*p | mu,n,p | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| stats-v4-binomial-probability | Binomial Point Probability | STATISTICS | Statistics Expansion | Distributions |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| stats-v4-chi-square | Chi-Square Goodness of Fit | STATISTICS | Statistics Expansion | Inference |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| stats-v4-coefficient-variation | Coefficient of Variation | STATISTICS | Statistics Expansion | Dispersion | CV = sigma/mu*100 | CV,mu,sigma | OPENSTAX_INTRODUCTORY_STATISTICS_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| stats-v4-covariance-correlation | Covariance and Pearson Correlation | STATISTICS | Statistics Expansion | Association |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| stats-v4-linear-regression | Simple Linear Regression | STATISTICS | Statistics Expansion | Regression |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| stats-v4-margin-error | Margin of Error for Mean | STATISTICS | Statistics Expansion | Confidence intervals | E = z*sigma/sqrt(n) | E,n,sigma,z | OPENSTAX_INTRODUCTORY_STATISTICS_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| stats-v4-normal-cdf | Normal Distribution CDF | STATISTICS | Statistics Expansion | Distributions |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| stats-v4-sample-size | Sample Size from Margin of Error | STATISTICS | Statistics Expansion | Sampling | n = (z*sigma/E)^2 | E,n,sigma,z | OPENSTAX_INTRODUCTORY_STATISTICS_2E\|V4_ORIGINAL_MISSION\|V4_SUBJECT_EXPANSION |
| stats-v4-standard-error | Standard Error of Mean | STATISTICS | Statistics Expansion | Sampling | SE=sigma/sqrt(n) | SE,n,sigma | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| stats-v4-z-score | Z-Score | STATISTICS | Statistics Expansion | Standardization | z=(x-mu)/sigma | mu,sigma,x,z | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| text-analyzer | Text Analyzer | TEXT_LANGUAGE | Text | Counts and language metadata |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| text-v4-reading-time | Reading Time | TEXT_LANGUAGE | Text Expansion | Reading metrics | minutes=words/wpm | minutes,words,wpm | V4_DETERMINISTIC_CATALOG\|V4_ORIGINAL_MISSION |
| text-v4-transform | Text Case and Unicode Normalization | TEXT_LANGUAGE | Text Expansion | Normalization |  |  | V4_ORIGINAL_MISSION\|V4_SPECIALIZED_DETERMINISTIC |
| triangle-solver | Triangle Solver | GEOMETRY | Triangle | Side and angle solving |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| variance | Variance | STATISTICS | Descriptive Statistics | Dataset |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| vector-tool | Vector Calculator | MATH | Linear Algebra | Vectors |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| vieta | Vieta's Formulas | MATH | Algebra | Quadratic equations |  |  | BACKEND_1_1_VERIFIED_BASELINE |
| weighted-mean | Weighted Mean | STATISTICS | Descriptive Statistics | Weighted data |  |  | BACKEND_1_1_VERIFIED_BASELINE |
