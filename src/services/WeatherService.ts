import type { WeatherData } from '@/types';

class WeatherServiceClass {
  getCurrentWeather(): WeatherData {
    const hour = new Date().getHours();
    const month = new Date().getMonth();

    let baseTemp = 22;
    if (month >= 5 && month <= 8) baseTemp = 27;
    if (month >= 9 && month <= 10) baseTemp = 24;
    if (month <= 1 || month === 11) baseTemp = 14;

    const dayFactor = Math.sin(((hour - 6) / 12) * Math.PI);
    const temperature = Math.round(baseTemp + dayFactor * 5);

    const conditions: WeatherData[] = [
      {
        temperature,
        condition: 'clear',
        rainProbability: 5,
        windSpeedKmh: 12,
        description: 'Excellent outdoor conditions',
      },
      {
        temperature: temperature - 2,
        condition: 'partly_cloudy',
        rainProbability: 15,
        windSpeedKmh: 16,
        description: 'Good outdoor conditions',
      },
      {
        temperature: temperature - 4,
        condition: 'cloudy',
        rainProbability: 40,
        windSpeedKmh: 20,
        description: 'Overcast but dry',
      },
      {
        temperature: temperature - 6,
        condition: 'rain',
        rainProbability: 80,
        windSpeedKmh: 25,
        description: 'Rain expected — indoor options better',
      },
    ];

    const seed = (hour + month * 31) % 4;
    return conditions[seed];
  }

  getOutdoorScore(weather: WeatherData, prefersShade: boolean): number {
    let score = 50;
    if (weather.temperature >= 18 && weather.temperature <= 28) score += 25;
    else if (weather.temperature > 28) score += prefersShade ? 15 : 10;
    else if (weather.temperature < 12) score -= 20;

    if (weather.rainProbability > 60) score -= 30;
    else if (weather.rainProbability > 30) score -= 15;

    if (weather.windSpeedKmh > 25) score -= 10;

    return Math.max(0, Math.min(100, score));
  }
}

export const WeatherService = new WeatherServiceClass();
