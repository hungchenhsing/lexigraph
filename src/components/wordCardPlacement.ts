/**
 * Desktop uses the side panel. A floating card there covers the next
 * lines and steals clicks (including the settings link inside the card).
 * Phones keep the bottom sheet.
 */
export function showFloatingWordCard(narrowLayout: boolean): boolean {
  return narrowLayout;
}
