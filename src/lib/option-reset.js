export const OPTION_RESET_INSTRUCTION = "Option-click to reset";

export const hasResetDefault = (defaultValue) => defaultValue !== undefined;

export const optionResetTitle = (defaultValue, displayValue = String(defaultValue)) => (
  hasResetDefault(defaultValue) ? `${OPTION_RESET_INSTRUCTION} to ${displayValue}` : undefined
);

export const handleOptionReset = (event, { defaultValue, disabled = false, onReset }) => {
  if (!event.altKey || disabled || !hasResetDefault(defaultValue) || typeof onReset !== "function") return false;
  event.preventDefault();
  event.stopPropagation();
  onReset(defaultValue);
  return true;
};

export const handleOptionResetKey = (event, options) => {
  if (!["Enter", " "].includes(event.key)) return false;
  return handleOptionReset(event, options);
};
