import { ReactNode, useCallback, useEffect, useState } from "react";
import { getKindredApi } from "../lib/kindredApi";

interface ToolbarProps {
  isRunning: boolean;
  canRun: boolean;
  onSave: () => void;
  onRun: () => void;
  onStop: () => void;
  children?: ReactNode;
}

export default function Toolbar({
  isRunning,
  canRun,
  onSave,
  onRun,
  onStop,
  children
}: ToolbarProps) {
  const api = getKindredApi();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    api.windowIsMaximized().then(setIsMaximized).catch(() => {});
    const unsubscribeMaximize = api.onMaximizeChange(setIsMaximized);
    const unsubscribeFocus = api.onFocusChange(setIsFocused);
    return () => {
      unsubscribeMaximize();
      unsubscribeFocus();
    };
  }, [api]);

  const handleMinimize = useCallback(() => api.windowMinimize(), [api]);
  const handleMaximize = useCallback(() => api.windowMaximize(), [api]);
  const handleClose = useCallback(() => api.windowClose(), [api]);

  return (
    <header className={`toolbar${isFocused ? "" : " inactive"}`} id="app-toolbar">
      <div className="toolbar-left">
        <div className="brand-lockup" aria-label="Kindred">
          <img src="/kindredlogo.png" alt="" className="toolbar-logo" />
          <span className="brand-name">Kindred</span>
        </div>
      </div>
      <div className="toolbar-center">
        {children}
      </div>
      <div className="toolbar-right">
        {isRunning ? (
          <button type="button" className="btn danger-ghost" onClick={onStop} title="Stop execution">
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn primary run-button"
            onClick={onRun}
            disabled={!canRun}
            title="Ctrl+Enter or F5"
          >
            ▶ Run
          </button>
        )}
        <button type="button" className="btn" onClick={onSave} title="Ctrl+S">
          Save
        </button>

        <div className="toolbar-separator" />

        <div className="window-controls">
          <button
            type="button"
            className="window-btn window-btn-minimize"
            onClick={handleMinimize}
            aria-label="Minimize"
            title="Minimize"
          >
            <span className="window-glyph glyph-minimize" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`window-btn window-btn-maximize${isMaximized ? " is-maximized" : ""}`}
            onClick={handleMaximize}
            aria-label={isMaximized ? "Restore" : "Maximize"}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            <span className={`window-glyph ${isMaximized ? "glyph-restore" : "glyph-maximize"}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="window-btn window-btn-close"
            onClick={handleClose}
            aria-label="Close"
            title="Close"
          >
            <span className="window-glyph glyph-close" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
