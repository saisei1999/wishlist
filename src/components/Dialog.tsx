import { useEffect, useRef, type ReactNode } from 'react';

type DialogProps = {
  title: string;
  subtitle?: string;
  labelledBy?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: Escape closes, focus is trapped while open, and focus returns to
 * whatever opened it. No native confirm() anywhere in this app.
 */
export function Dialog({ title, subtitle, labelledBy = 'dialog-title', onClose, children, footer }: DialogProps) {
  const surface = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const node = surface.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (!firstEl || !lastEl) return;
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const previous = opener.current;
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, [onClose]);

  return (
    <div
      className="backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={surface} tabIndex={-1}>
        <h2 id={labelledBy}>{title}</h2>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
        {children}
        {footer ? <div className="dialog-actions">{footer}</div> : null}
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </div>
    </div>
  );
}
