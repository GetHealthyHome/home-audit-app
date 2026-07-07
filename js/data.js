/* Static domain data driving the screens — zone definitions, safety test
   protocols, and the improvement catalog. Content mirrors the Figma designs. */
window.DATA = {

  /* ---- Bottom navigation (single global IA — resolves the per-screen
     nav inconsistency flagged in docs/FIGMA_UX_REVIEW.md) ---- */
  TABS: [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', route: '#/dashboard' },
    { id: 'assess', label: 'Assess', icon: 'clipboard', route: '#/assess' },
    { id: 'fab', label: '', icon: 'plus', route: '#/new' },
    { id: 'proposal', label: 'Proposal', icon: 'doc', route: '#/proposal' },
    { id: 'history', label: 'History', icon: 'history', route: '#/history' }
  ],

  MOTIVATIONS: ['High Bills', 'Comfort / Drafts', 'Ice Dams', 'Indoor Air Quality', 'Resale Prep', 'Other'],
  HEAT_TYPES: ['Gas Furnace', 'Gas Boiler', 'Heat Pump', 'Electric Baseboard', 'Oil Furnace', 'Wood / Pellet', 'Other'],

  /* ---- Zone assessments (Sections 01–08, per the Figma zone screens) ---- */
  ZONES: [
    { id: 'siteinfo', num: '01', name: 'Site Info & Building Science', icon: 'home', special: 'site' },
    { id: 'crawlspace', num: '02', name: 'Crawlspace Assessment', icon: 'layers',
      sub: 'Detailed evaluation of structural health and moisture barriers.' },
    { id: 'basement', num: '03', name: 'Basement Assessment', icon: 'box',
      sub: 'Detailed technical audit of mechanical systems and foundation.' },
    { id: 'attic', num: '04', name: 'Attic Insulation & Airflow', icon: 'home',
      sub: 'Detailed thermal barrier evaluation and ventilation efficiency audit.' },
    { id: 'floor1', num: '05', name: 'Living Floor 1', icon: 'window',
      sub: 'Main floor thermal envelope and window integrity analysis. Focus on air infiltration and insulation continuity.' },
    { id: 'floor2', num: '05b', name: 'Living Floor 2', icon: 'window',
      sub: 'Second floor thermal envelope and window integrity analysis. Focus on air infiltration and insulation continuity.' },
    { id: 'floor3', num: '05c', name: 'Living Floor 3', icon: 'window',
      sub: 'Third floor thermal envelope and window integrity analysis. Focus on air infiltration and insulation continuity.' },
    { id: 'garage', num: '07', name: 'Garage Assessment', icon: 'garage',
      sub: 'Evaluate structural integrity, fire safety protocols, and thermal boundaries of the vehicle storage area.' },
    { id: 'exterior', num: '08', name: 'Exterior Assessment', icon: 'truck',
      sub: 'Site logistics, envelope condition, and drainage review from the outside in.' }
  ],

  BASEMENT_SYSTEMS: [
    { id: 'waterheater', name: 'Water Heater', icon: 'heater' },
    { id: 'boiler', name: 'Boiler', icon: 'boiler' },
    { id: 'furnace', name: 'Furnace', icon: 'flame' },
    { id: 'airhandler', name: 'Air Handler', icon: 'fan' },
    { id: 'dehumidifier', name: 'Dehumidifier', icon: 'droplet' },
    { id: 'other', name: 'Other', icon: 'box' }
  ],
  FUEL_TYPES: ['Natural Gas', 'Electric', 'Propane', 'Oil', 'Solar / Hybrid'],

  INSULATION_TYPES: [
    { name: 'Blown-in Cellulose', rPerInch: 3.5 },
    { name: 'Blown-in Fiberglass', rPerInch: 2.5 },
    { name: 'Fiberglass Batts', rPerInch: 3.2 },
    { name: 'Rock Wool', rPerInch: 3.3 },
    { name: 'Spray Foam (Closed Cell)', rPerInch: 6.5 },
    { name: 'None / Unknown', rPerInch: 0 }
  ],

  VAPOR_BARRIER: ['Present & Intact', 'Damaged / Partial', 'Missing'],
  CRAWL_INSULATION: ['Fiberglass - Secure', 'Fiberglass - Sagging', 'Spray Foam - Intact', 'None'],

  WINDOW_TYPES: ['Double Hung', 'Casement', 'Slider', 'Fixed / Picture', 'Awning', 'Single Hung'],
  GLAZING_TYPES: ['Single Pane', 'Double Pane', 'Triple Pane', 'Double Pane (Low-E)'],
  WINDOW_CONDITIONS: ['Good', 'Fair', 'Poor'],
  FLOOR_PHOTO_TARGET: 12,
  EXTERIOR_PHOTO_TARGET: 12,
  SIDING_TYPES: ['Vinyl', 'Wood / Cedar', 'Fiber Cement', 'Aluminum / Steel', 'Brick / Masonry', 'Stucco', 'Composite', 'Other'],

  /* ---- Mechanicals (hub section alongside Diagnostics and Zones) ---- */
  MECHANICALS: [
    { id: 'heating', name: 'Heating System', icon: 'flame', fields: [
      { key: 'type', label: 'System Type', options: ['Gas Furnace', 'Gas Boiler', 'Heat Pump', 'Electric Baseboard', 'Oil Furnace', 'Wood / Pellet', 'Other'] },
      { key: 'age', label: 'Age (Years)', type: 'number' },
      { key: 'eff', label: 'Efficiency Rating', type: 'number', unit: '% AFUE' },
      { key: 'condition', label: 'Condition', options: ['Good', 'Fair', 'Poor', 'End of Life'] }
    ] },
    { id: 'cooling', name: 'Cooling / HVAC', icon: 'air', fields: [
      { key: 'type', label: 'System Type', options: ['Central AC', 'Heat Pump', 'Mini-Split', 'Window Units', 'None'] },
      { key: 'age', label: 'Age (Years)', type: 'number' },
      { key: 'seer', label: 'SEER Rating', type: 'number' },
      { key: 'condition', label: 'Condition', options: ['Good', 'Fair', 'Poor', 'End of Life'] }
    ] },
    { id: 'waterheater', name: 'Water Heater', icon: 'heater', fields: [
      { key: 'type', label: 'Type', options: ['Tank - Gas', 'Tank - Electric', 'Tankless', 'Heat Pump Water Heater', 'Indirect / Boiler'] },
      { key: 'capacity', label: 'Capacity', type: 'number', unit: 'gal' },
      { key: 'age', label: 'Age (Years)', type: 'number' },
      { key: 'condition', label: 'Condition', options: ['Good', 'Fair', 'Poor', 'End of Life'] }
    ] },
    { id: 'electrical', name: 'Electrical Panel', icon: 'bolt', fields: [
      { key: 'amperage', label: 'Panel Amperage', options: ['100A', '150A', '200A', '400A', 'Fuse Box / Other'] },
      { key: 'space', label: 'Open Breaker Spaces?', options: ['Yes', 'No', 'Subpanel Present'] },
      { key: 'notes', label: 'Brand / Notes', textarea: true }
    ] },
    { id: 'mechvent', name: 'Mechanical Ventilation', icon: 'fan', fields: [
      { key: 'type', label: 'Equipment', options: ['ERV', 'HRV', 'Exhaust Fans Only', 'Whole-House Fan', 'None'] },
      { key: 'condition', label: 'Condition', options: ['Good', 'Fair', 'Poor', 'Not Operational'] }
    ] },
    { id: 'othermech', name: 'Other', icon: 'box', fields: [
      { key: 'desc', label: 'Description', textarea: true }
    ] }
  ],

  /* Crawlspace pricing rule from the Figma: heights below 36" trigger a
     restricted-mobility labor upcharge. */
  CRAWL_MIN_CLEARANCE_IN: 36,
  CRAWL_UPCHARGE: 150,

  /* ---- Blower door (mandatory setup checklist gates measurement) ---- */
  BLOWER_CHECKLIST: [
    { id: 'windows', name: 'All exterior windows and doors closed', desc: 'Ensure a tight seal across the building envelope.' },
    { id: 'dampers', name: 'Fireplace dampers and flues closed', desc: 'Prevent ash and debris backdraft during depressurization.' },
    { id: 'combustion', name: 'Combustion appliances switched off', desc: 'Disable boilers, water heaters, and furnaces.' },
    { id: 'doors', name: 'Interior doors opened to all conditioned zones', desc: 'Allows uniform pressure throughout the envelope.' },
    { id: 'access', name: 'Basement/attic access secured', desc: 'Check secondary boundary zones for leaks.' }
  ],
  BLOWER_RINGS: ['Open', 'Ring A', 'Ring B', 'Ring C'],
  BLOWER_PHOTOS: [
    { id: 'setup', label: 'Overall Setup', required: true },
    { id: 'manometer', label: 'Manometer Reading', required: true },
    { id: 'doc1', label: 'Optional Doc', required: false },
    { id: 'doc2', label: 'Optional Doc', required: false }
  ],

  /* ---- CAZ / combustion safety hard-stops ---- */
  CAZ_TESTS: [
    { id: 'venting', name: 'Venting Test', icon: 'wind', desc: 'Verify adequate draft and physical integrity of flue pipes.' },
    { id: 'gasleak', name: 'Gas Leak Detection', icon: 'alert', desc: 'Electronic combustible gas leak detection at any fitting.' },
    { id: 'co', name: 'Undiluted CO Test', icon: 'flame', desc: 'Measure CO levels directly from the exhaust stream.' },
    { id: 'spillage', name: 'Ambient CO/Spillage Test', icon: 'shield', desc: 'Check for room-level CO and spillage during worst-case depressurization.' }
  ],

  /* ---- IAQ baseline test ---- */
  IAQ_MINUTES: 30,
  IAQ_METRICS: [
    { id: 'co2', name: 'CO2 Level', unit: 'ppm', foot: 'Atmospheric baseline average',
      bands: [{ max: 600, label: 'Optimal' }, { max: 1000, label: 'Acceptable' }, { max: Infinity, label: 'Elevated' }] },
    { id: 'voc', name: 'VOC Concentration', unit: 'mg/m³', foot: 'Organic compound threshold',
      bands: [{ max: 0.3, label: 'Excellent' }, { max: 0.5, label: 'Acceptable' }, { max: Infinity, label: 'Elevated' }] }
  ],

  /* ---- Improvement catalog (Est. ROI and copy from the Figma catalog) ---- */
  CATALOG_CATS: ['All Measures', 'Attic & Insulation', 'HVAC Systems', 'Basement & Foundation', 'Windows'],
  CATALOG: [
    { id: 'cellulose', cat: 'Attic & Insulation', name: 'Blown-in Cellulose', icon: 'home',
      impact: 'High Impact', roi: 14, cost: 2200, savings: 310,
      desc: 'Environmentally friendly insulation treated for fire resistance. Ideal for topping up existing attic levels to R-60 standards.',
      science: 'The attic represents the largest surface for *convective heat transfer*. Dense-pack cellulose slows heat migration through the thermal boundary, stabilizing interior temperatures year-round.',
      benefits: ['Reduces HVAC load during peak seasons', 'Prevents ice damming through even roof-deck temperatures'] },
    { id: 'airseal', cat: 'Attic & Insulation', name: 'Air Sealing Package', icon: 'wind',
      impact: 'Critical', roi: 22, cost: 1450, savings: 320,
      desc: 'Comprehensive sealing of bypasses, top plates, and penetrations using two-component spray foam and fire-rated caulk.',
      science: 'Air leakage accounts for up to 30% of heating losses. Sealing the *pressure boundary* first multiplies the effectiveness of any insulation added afterward.',
      benefits: ['Cuts measurable CFM50 leakage', 'Improves draft comfort immediately'] },
    { id: 'hatch', cat: 'Attic & Insulation', name: 'Attic Hatch Cover', icon: 'box',
      impact: 'Quick Win', roi: 8, cost: 240, savings: 20,
      desc: 'Insulated and weather-stripped cover for the attic access point to prevent chimney-effect heat loss.',
      science: 'An unsealed hatch behaves like an open flue — the *stack effect* pulls conditioned air straight through it into the attic.',
      benefits: ['Eliminates a concentrated bypass', 'Installs in under an hour'] },
    { id: 'ashp', cat: 'HVAC Systems', name: 'ASHP Retrofit', icon: 'air',
      impact: 'Elite', roi: 18, cost: 8400, savings: 1150, rebate: '40% Rebate Eligible',
      desc: 'Air Source Heat Pump installation. High-efficiency heating and cooling with cold-climate performance down to -15°F.',
      science: 'Heat pumps move heat instead of generating it, delivering 2.5–3.5 units of heat per unit of electricity — a *coefficient of performance* no combustion appliance can match.',
      benefits: ['Multi-zone high efficiency system', 'Eligible for major utility rebates'] },
    { id: 'thermostat', cat: 'HVAC Systems', name: 'Smart Thermostat', icon: 'thermo',
      impact: 'Quick Win', roi: 12, cost: 380, savings: 65,
      desc: 'WiFi-enabled learning thermostat with room sensors to optimize comfort and reduce unnecessary cycling.',
      science: 'Setback scheduling recovers energy lost to *unoccupied conditioning* — the cheapest kWh is the one never used.',
      benefits: ['Learns occupancy patterns', 'Remote diagnostics for the homeowner'] },
    { id: 'rimjoist', cat: 'Basement & Foundation', name: 'Rim Joist Sealing', icon: 'layers',
      impact: 'High Impact', roi: 15, cost: 950, savings: 140,
      desc: 'Rigid foam and spray foam sealing of the foundation-to-frame interface. Stops significant draft entry.',
      science: 'The rim joist is the leakiest framing junction in most homes — sealing it interrupts the *stack effect* at its intake.',
      benefits: ['Warms first-floor perimeter', 'Deters pest entry'] },
    { id: 'vapor', cat: 'Basement & Foundation', name: 'Vapor Barrier', icon: 'droplet',
      impact: 'Health', roi: 5, cost: 1200, savings: 60,
      desc: '6-mil polyethylene ground cover for crawlspaces to manage moisture levels and improve indoor air quality.',
      science: 'Ground moisture migrates upward into living space via *vapor drive*; a sealed barrier keeps humidity and soil gases out of the air you breathe.',
      benefits: ['Reduces mold risk', 'Protects framing from rot'] },
    { id: 'windows3p', cat: 'Windows', name: 'Triple Pane Windows', icon: 'window',
      impact: 'Comfort', roi: 6, cost: 4250, savings: 240, rebate: 'Energy Star Tier 3',
      desc: 'North-facing thermal barrier upgrade. Replaces failing single/double pane units with argon-filled triple glazing.',
      science: 'Each additional pane and low-E coating cuts *radiative and conductive losses*; triple glazing also raises interior glass temperature, eliminating cold-surface drafts.',
      benefits: ['Ends condensation streaking', 'Noticeable acoustic dampening'] }
  ],

  MARKET_AVG_PAYBACK_YEARS: 9
};
