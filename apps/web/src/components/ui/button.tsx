import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

// Using inline style for primary so CSS variables resolve correctly at runtime
const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:   '',   // style applied via inline style below
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  outline:   'border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-background)]',
  ghost:     'text-[var(--color-text-muted)] hover:bg-[var(--color-background)]',
}

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  disabled,
  style,
  children,
  ...props
}: ButtonProps) {
  const isPrimary = variant === 'primary'

  return (
    <button
      {...props}
      disabled={disabled ?? loading}
      style={isPrimary ? {
        backgroundColor: 'var(--color-primary)',
        color: '#fff',
        ...style,
      } : style}
      className={[
        'inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius-md)]',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      onMouseEnter={e => {
        if (isPrimary && !(disabled ?? loading)) {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-primary-hover)'
        }
      }}
      onMouseLeave={e => {
        if (isPrimary) {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-primary)'
        }
      }}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}
