const BOARD_MAP: Record<string, 'RO' | 'BB' | 'HB' | 'FB' | 'AI'> = {
  'room only': 'RO', 'no meals': 'RO', 'accommodation only': 'RO', 'bed only': 'RO',
  'bed & breakfast': 'BB', 'bed and breakfast': 'BB', 'b&b': 'BB', 'breakfast included': 'BB',
  'with breakfast': 'BB', 'petit-déjeuner': 'BB', 'petit dejeuner': 'BB', 'mit frühstück': 'BB', 'desayuno': 'BB',
  'half board': 'HB', 'half-board': 'HB', 'demi-pension': 'HB', 'halbpension': 'HB', 'media pensión': 'HB',
  'full board': 'FB', 'full-board': 'FB', 'all meals': 'FB', 'pension complète': 'FB', 'vollpension': 'FB',
  'all inclusive': 'AI', 'all-inclusive': 'AI', 'tout inclus': 'AI', 'alles inklusive': 'AI',
}

export function normaliseBoard(label: string): 'RO' | 'BB' | 'HB' | 'FB' | 'AI' | null {
  const key = label.toLowerCase().trim()
  for (const [pattern, code] of Object.entries(BOARD_MAP)) {
    if (key.includes(pattern)) return code
  }
  return null
}
