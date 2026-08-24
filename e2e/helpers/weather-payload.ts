/**
 * A fullscreen-weather payload rich enough that every optional section
 * renders: alert band, nowcast strip, ribbon, stat rail, and all five Almanac
 * readouts. Shared by the scale and landscape specs so the two measure the
 * same layout — a difference between them should mean the canvas changed, not
 * the data.
 *
 * `start` pins the first hourly entry; a test that depends on where the
 * timeline crosses midnight must pass one, or its answer changes with the
 * hour the suite happens to run at.
 */
export function richWeather(start = Date.now()) {
  const now = start;
  return {
    hourly: Array.from({ length: 48 }, (_, i) => {
      const h = (14 + i) % 24;
      const temp = Math.round(71 + 12 * Math.cos(((h - 15) / 24) * Math.PI * 2));
      return {
        time: new Date(now + i * 3600_000).toISOString(),
        temp, feelsLike: temp + 3, humidity: 44 + (i % 20),
        pressure: 1012 - Math.round(i / 6), dewPoint: temp - 26,
        uvIndex: h > 9 && h < 17 ? 7 : 0, visibility: 10,
        icon: i % 11 === 3 ? 'cloud-rain' : 'sun',
        description: i % 11 === 3 ? 'Rain' : 'Sunny',
        windSpeed: 6 + (i % 9), precipProbability: i % 11 === 3 ? 70 : 0,
      };
    }),
    forecast: Array.from({ length: 7 }, (_, d) => ({
      date: new Date(now + d * 86400_000).toISOString().slice(0, 10),
      high: 84 - d * 2, low: 58 + d, icon: 'sun', description: 'Sunny',
      precipProbability: d === 3 ? 80 : 5,
      windSpeed: 8 + d,
    })),
    minutely: Array.from({ length: 60 }, (_, m) => ({
      time: Math.floor(now / 1000) + m * 60,
      intensity: Math.max(0, 0.34 * (1 - m / 42)), probability: Math.max(0, 90 - m * 2),
    })),
    alerts: [{
      title: 'Severe Thunderstorm Warning', severity: 'Severe',
      description: 'Until 7:45 PM. Damaging wind gusts to 60 mph and quarter-size hail.',
      expires: Math.floor(now / 1000) + 7200,
    }],
  };
}
