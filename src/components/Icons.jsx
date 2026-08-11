import React from "react";

const Icon = ({ children, size = 18, className = "" }) => (
  <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {children}
  </svg>
);

export const PlayIcon = (props) => <Icon {...props}><path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" /></Icon>;
export const PauseIcon = (props) => <Icon {...props}><path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="2.2" /></Icon>;
export const ChevronIcon = ({ direction = "down", ...props }) => {
  const paths = { down: "m7 9 5 5 5-5", up: "m7 15 5-5 5 5", left: "m15 7-5 5 5 5", right: "m9 7 5 5-5 5" };
  return <Icon {...props}><path d={paths[direction]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" /></Icon>;
};
export const PlusIcon = (props) => <Icon {...props}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" /></Icon>;
export const RefreshIcon = (props) => <Icon {...props}><path d="M20 7v5h-5M4 17v-5h5M6.2 8.3A7 7 0 0 1 18 6l2 6M18 15.7A7 7 0 0 1 6 18l-2-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" /></Icon>;
export const ExportIcon = (props) => <Icon {...props}><path d="M12 15V3m0 0L8 7m4-4 4 4M5 13v7h14v-7" stroke="currentColor" strokeWidth="1.7" /></Icon>;
export const SearchIcon = (props) => <Icon {...props}><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" /><path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="1.7" /></Icon>;
export const FolderIcon = (props) => <Icon {...props}><path d="M3 7h7l2-3h9v16H3V7Z" stroke="currentColor" strokeWidth="1.6" /></Icon>;
export const MusicIcon = (props) => <Icon {...props}><path d="M9 18V6l10-2v12M9 8l10-2M6.5 21A2.5 2.5 0 1 0 6.5 16a2.5 2.5 0 0 0 0 5ZM16.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="currentColor" strokeWidth="1.6" /></Icon>;
export const ImageIcon = (props) => <Icon {...props}><rect x="3" y="4" width="18" height="16" stroke="currentColor" strokeWidth="1.6"/><circle cx="8.5" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="m4 18 5-5 3 3 3-4 5 6" stroke="currentColor" strokeWidth="1.6"/></Icon>;
export const DocumentIcon = (props) => <Icon {...props}><path d="M6 3h8l4 4v14H6V3Z" stroke="currentColor" strokeWidth="1.6"/><path d="M14 3v5h5M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.5"/></Icon>;
export const WarningIcon = (props) => <Icon {...props}><path d="M12 3 2.7 20h18.6L12 3Z" stroke="currentColor" strokeWidth="1.6" /><path d="M12 9v5m0 3v.2" stroke="currentColor" strokeWidth="1.8" /></Icon>;
export const CheckIcon = (props) => <Icon {...props}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><path d="m7.5 12 3 3 6-7" stroke="currentColor" strokeWidth="1.8" /></Icon>;
export const DragIcon = (props) => <Icon {...props}><g fill="currentColor"><circle cx="8" cy="6" r="1.2"/><circle cx="16" cy="6" r="1.2"/><circle cx="8" cy="12" r="1.2"/><circle cx="16" cy="12" r="1.2"/><circle cx="8" cy="18" r="1.2"/><circle cx="16" cy="18" r="1.2"/></g></Icon>;
export const TransitionIcon = (props) => <Icon {...props}><path d="m4 5 7 7-7 7M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.7" /></Icon>;
export const MoreIcon = (props) => <Icon {...props}><g fill="currentColor"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></g></Icon>;
export const TrashIcon = (props) => <Icon {...props}><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7" stroke="currentColor" strokeWidth="1.6" /></Icon>;
export const ScissorsIcon = (props) => <Icon {...props}><circle cx="6" cy="7" r="3" stroke="currentColor" strokeWidth="1.6"/><circle cx="6" cy="17" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="m8.5 8.5 11 7M8.5 15.5l11-7" stroke="currentColor" strokeWidth="1.6"/></Icon>;
export const DownloadIcon = (props) => <Icon {...props}><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" strokeWidth="1.7" /></Icon>;
export const LockIcon = (props) => <Icon {...props}><rect x="5" y="10" width="14" height="11" stroke="currentColor" strokeWidth="1.6"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" /></Icon>;
export const WaveIcon = (props) => <Icon {...props}><path d="M3 12h2m2 0h1m2 0h1m2 0h1m2 0h1m2 0h2M6 8v8m3-11v14m3-9v4m3-7v10m3-13v16" stroke="currentColor" strokeWidth="1.5" /></Icon>;
export const SunIcon = (props) => <Icon {...props}><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" stroke="currentColor" strokeWidth="1.6"/></Icon>;
export const MoonIcon = (props) => <Icon {...props}><path d="M20 15.4A8.5 8.5 0 0 1 8.6 4a8.5 8.5 0 1 0 11.4 11.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></Icon>;
export const PaletteIcon = (props) => <Icon {...props}><path d="M12 3a9 9 0 1 0 0 18h1.4a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h4.5A4.5 4.5 0 0 0 21 8.5C21 5.5 16.8 3 12 3Z" stroke="currentColor" strokeWidth="1.6"/><circle cx="7.5" cy="10" r="1" fill="currentColor"/><circle cx="10" cy="6.8" r="1" fill="currentColor"/><circle cx="15" cy="7" r="1" fill="currentColor"/></Icon>;
export const EditIcon = (props) => <Icon {...props}><path d="m4 20 4.2-1 10.6-10.6-3.2-3.2L5 15.8 4 20Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m13.8 7 3.2 3.2M4 20h7" stroke="currentColor" strokeWidth="1.6"/></Icon>;
export const SequenceIcon = (props) => <Icon {...props}><path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" strokeWidth="1.7"/><path d="M4 5h1v2H4M4 11h1v2H4M4 17h1v2H4" stroke="currentColor" strokeWidth="1.5"/></Icon>;
export const ReviewIcon = (props) => <Icon {...props}><path d="M6 3h12v18H6V3Z" stroke="currentColor" strokeWidth="1.6"/><path d="m9 9 1.5 1.5L14 7M9 15h6" stroke="currentColor" strokeWidth="1.6"/></Icon>;
export const SettingsIcon = (props) => <Icon {...props}><path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h10M18 18h2" stroke="currentColor" strokeWidth="1.6"/><circle cx="14" cy="6" r="2" stroke="currentColor" strokeWidth="1.6"/><circle cx="9" cy="12" r="2" stroke="currentColor" strokeWidth="1.6"/><circle cx="16" cy="18" r="2" stroke="currentColor" strokeWidth="1.6"/></Icon>;
export const GearIcon = (props) => <Icon {...props}><path d="M9.8 3.4h4.4l.7 2.2c.5.2 1 .5 1.4.8l2.2-.5 2.2 3.8-1.6 1.7v1.2l1.6 1.7-2.2 3.8-2.2-.5c-.4.3-.9.6-1.4.8l-.7 2.2H9.8l-.7-2.2c-.5-.2-1-.5-1.4-.8l-2.2.5-2.2-3.8 1.6-1.7v-1.2L3.3 9.7l2.2-3.8 2.2.5c.4-.3.9-.6 1.4-.8l.7-2.2Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/></Icon>;
export const PanelLeftIcon = ({ collapsed = false, ...props }) => <Icon {...props}><rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="1.6"/><path d="M9 3v18" stroke="currentColor" strokeWidth="1.6"/><path d={collapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="square"/></Icon>;
export const PanelRightIcon = ({ collapsed = false, ...props }) => <Icon {...props}><rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="1.6"/><path d="M15 3v18" stroke="currentColor" strokeWidth="1.6"/><path d={collapsed ? "m11 9-3 3 3 3" : "m8 9 3 3-3 3"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="square"/></Icon>;
