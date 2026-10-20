import type { Workflow } from '../api/types'

/** Adult (`is_nsfw`) workflows are hidden everywhere unless the user turned the setting on. */
export const isVisible = (w: Workflow, showAdult: boolean): boolean => showAdult || !w.is_nsfw

export const visibleWorkflows = (list: Workflow[], showAdult: boolean): Workflow[] =>
  list.filter((w) => isVisible(w, showAdult))
