// Single home for every scoring weight, threshold and playback constant.
// Score is a prototype evidence index, NOT a probability.

export const SCORING = {
  e911: {
    first: 40,
    /** Report includes flames or a named road or landmark. */
    content: 10,
    cap: 75,
  },
  sms: { first: 15, gps: 5, trusted: 5, cap: 30 },
  goes: { low: 5, medium: 12, high: 20, cap: 30 },
  camera: {
    zeroBelow: 0.5,
    highAtLeast: 0.8,
    medium: 15,
    high: 25,
    highGrowing: 30,
    secondBearing: 10,
    /** Clear view with no smoke; the camera index is floored at zero. */
    clearView: -15,
    cap: 40,
  },
  outage: {
    /** Outage within one mile of smoke or heat, events starting within 20 minutes. */
    match: 10,
    /** Matching outage with wind at least 25 mph. */
    wind: 5,
    /** Cause reported as line down, wire down, or fault, when the field exists. */
    cause: 5,
    cap: 15,
    matchWindowSeconds: 20 * 60,
    matchRadiusKm: 1.609,
    windMinMph: 25,
  },
  crossClass: { two: 10, three: 5 },
  totalCap: 100,
} as const;

export type WeatherLevel = "normal" | "veryHigh" | "redFlag";

export const THRESHOLDS = {
  log: 30,
  verify: { normal: 50, veryHigh: 45, redFlag: 40 } as Record<WeatherLevel, number>,
  /** Confirmed: total reaches 80 and the dispatcher alert package is generated. */
  confirmed: 80,
  earlyDispatch: 50,
} as const;

/** County totals supplied by the presenter; not a live availability roster. */
export const COUNTY_RESPONSE_CAPACITY = { volunteerFirefighters: 200, fireStations: 13 } as const;

export const WEATHER_LABEL: Record<WeatherLevel, string> = {
  normal: "Normal fire danger",
  veryHigh: "Very high fire danger",
  redFlag: "Red flag warning",
};

/** Both supplied scenarios share these simulated conditions. */
export const SCENARIO_WEATHER = { windMph: 28, level: "redFlag" as WeatherLevel };

export const PLAYBACK = {
  /** At 1× playback, scenario seconds that pass per real second. */
  scenarioSecondsPerRealSecond: 14,
  outageSecondsPerRealSecond: 18,
  speeds: [1, 2, 4] as const,
  startT: 0,
  endT: 2400,
};

export const CAMERA_TRANSITION_SECONDS = 1.2;

/** Chosen illustrative size, not a spread forecast or an acres-saved estimate. */
export const FIRE_PRESENTATION = { finalT: 31 * 60, finalAcres: 250 } as const;

export const RESPONSE_TIMING = {
  /** Scenario seconds between simulated notification and simulated acceptance. */
  sendDelay: 15,
  ackDelay: 60,
  acceptDelay: 240,
  /** Scenario seconds for the scripted resource route. */
  travel: 1080,
  /** Scenario C's shorter illustrative route; first engine arrives before 3:18 PM with prompt authorization. */
  travelC: 540,
};

/** Scenario t=0 is 2:00:00 PM local (scripted). */
export const SCENARIO_START = { h: 14, m: 0, s: 0 };

/** Illustrative demo policy—not manufacturer specifications. */
export const DRONE_POLICY = {
  sustainedBelowMph: 20, gustBelowMph: 25, maxWeatherAgeSeconds: 600,
  maxRangeKm: 12, speedKmPerSecond: 0.012, launchSeconds: 0,
  minBatteryPercent: 70, minReturnReservePercent: 30, batteryPercentPerKm: 2,
  minVisibilityKm: 5, groundRouteKm: 24, groundSpeedKmPerSecond: 0.012,
  proposedEvidencePoints: 40, evidenceCap: 40,
} as const;
