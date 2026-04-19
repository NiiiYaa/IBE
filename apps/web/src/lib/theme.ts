import type { HotelDesignConfig } from '@ibe/shared'

export function buildCssVars(config: HotelDesignConfig): string {
  const font = config.fontFamily.replace(/'/g, '')
  return [
    `--color-primary:${config.colorPrimary}`,
    `--color-primary-hover:${config.colorPrimaryHover}`,
    `--color-primary-light:${config.colorPrimaryLight}`,
    `--color-accent:${config.colorAccent}`,
    `--color-background:${config.colorBackground}`,
    `--color-surface:${config.colorSurface}`,
    `--color-text:${config.colorText}`,
    `--color-text-muted:${config.colorTextMuted}`,
    `--color-border:${config.colorBorder}`,
    `--color-success:${config.colorSuccess}`,
    `--color-error:${config.colorError}`,
    `--font-sans:${font},system-ui,sans-serif`,
    `--radius-sm:${Math.max(2, config.borderRadius - 4)}px`,
    `--radius-md:${config.borderRadius}px`,
    `--radius-lg:${config.borderRadius + 4}px`,
    `--radius-xl:${config.borderRadius + 8}px`,
  ].join(';')
}
