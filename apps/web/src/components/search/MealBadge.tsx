import { BoardType, BOARD_TYPE_LABELS } from '@ibe/shared'

const MEAL_COLORS: Record<string, string> = {
  [BoardType.RoomOnly]:        'bg-gray-100 text-gray-700',
  [BoardType.BedAndBreakfast]: 'bg-amber-50 text-amber-800',
  [BoardType.HalfBoard]:       'bg-orange-50 text-orange-800',
  [BoardType.FullBoard]:       'bg-green-50 text-green-800',
  [BoardType.AllInclusive]:    'bg-emerald-50 text-emerald-800',
}

const MEAL_ICONS: Record<string, string> = {
  [BoardType.RoomOnly]:        '🛏️',
  [BoardType.BedAndBreakfast]: '🥐',
  [BoardType.HalfBoard]:       '🍽️',
  [BoardType.FullBoard]:       '🍴',
  [BoardType.AllInclusive]:    '🌟',
}

export function MealBadge({ board }: { board: string }) {
  const label = BOARD_TYPE_LABELS[board as BoardType] ?? board
  const colors = MEAL_COLORS[board] ?? 'bg-gray-100 text-gray-700'
  const icon = MEAL_ICONS[board]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors}`}>
      {icon && <span>{icon}</span>}
      {label}
    </span>
  )
}
