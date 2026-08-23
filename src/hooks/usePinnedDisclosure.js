import { useCallback, useState } from "react";
import { isExpertPanelPinned, setExpertPanelPinned } from "../lib/interface-preferences.js";

export function usePinnedDisclosure(panelId) {
  const [initial] = useState(() => {
    const pinned = isExpertPanelPinned(panelId);
    return { open: pinned, pinned };
  });
  const [open, setOpen] = useState(initial.open);
  const [pinned, setPinned] = useState(initial.pinned);

  const togglePinned = useCallback(() => {
    const nextPinned = !pinned;
    setPinned(nextPinned);
    if (nextPinned) setOpen(true);
    setExpertPanelPinned(panelId, nextPinned);
  }, [panelId, pinned]);

  return { open, pinned, setOpen, togglePinned };
}
