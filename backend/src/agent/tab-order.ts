/**
 * The focus stops the agent has actually reached, in Tab order, rebuilt only from
 * its own Tab and Shift+Tab presses (F-83). A screen-reader user remembers that the
 * cart button came just before the first product; a model forgets, presses Tab to
 * go back, and burns the budget. Nothing here comes from the page beyond what the
 * agent already heard when focus landed.
 */

export interface FocusStop {
  /** Stable identity of the focused element (backend DOM node id where known). */
  id: string;
  /** The element as last heard, e.g. "button, Cart (0)". */
  spoken: string;
  /** The AX node id, so the model can name it in a declaration. */
  axNodeId: string;
}

export interface TabOrderView {
  stops: FocusStop[];
  /** Index into stops, or null when focus is not on a known stop. */
  focusIndex: number | null;
}

export class TabOrderMemory {
  private stops: FocusStop[] = [];
  private focusId: string | null = null;

  /** Record one key press. `before` and `after` are the focused element around it, or null at the page start. */
  observe(key: string, before: FocusStop | null, after: FocusStop | null): void {
    if (!after) {
      this.focusId = null;
      return;
    }
    const known = this.stops.find((stop) => stop.id === after.id);
    if (known) {
      known.spoken = after.spoken;
      known.axNodeId = after.axNodeId;
      this.focusId = after.id;
      return;
    }
    const from = before ? this.stops.findIndex((stop) => stop.id === before.id) : -1;
    if (key === 'Tab') {
      // From the page start Tab reaches the first stop; otherwise the stop right after.
      if (before === null) this.stops.unshift({ ...after });
      else if (from >= 0) this.stops.splice(from + 1, 0, { ...after });
      else if (this.stops.length === 0) this.stops.push({ ...after });
      else {
        this.focusId = null;
        return;
      }
    } else if (key === 'Shift+Tab') {
      if (before === null) this.stops.push({ ...after });
      else if (from >= 0) this.stops.splice(from, 0, { ...after });
      else if (this.stops.length === 0) this.stops.push({ ...after });
      else {
        this.focusId = null;
        return;
      }
    } else {
      // Enter, arrows or Escape moved focus somewhere whose place in the Tab order is unknown.
      this.focusId = null;
      return;
    }
    this.focusId = after.id;
  }

  /** A new page: nothing remembered applies. */
  reset(): void {
    this.stops = [];
    this.focusId = null;
  }

  view(): TabOrderView {
    const index = this.focusId === null ? -1 : this.stops.findIndex((stop) => stop.id === this.focusId);
    return { stops: this.stops.map((stop) => ({ ...stop })), focusIndex: index >= 0 ? index : null };
  }
}
