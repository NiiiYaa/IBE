export type WeatherUnits = 'celsius' | 'fahrenheit'

export interface WeatherConfigResponse {
  units: WeatherUnits
  forecastDays: number
  enabled: boolean
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
}

export interface WeatherConfigUpdate {
  units?: WeatherUnits
  forecastDays?: number
  enabled?: boolean
  systemServiceDisabled?: boolean
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
}
