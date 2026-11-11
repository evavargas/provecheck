import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Badge shown left of the title (modals). */
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'modal' | 'drawer';
}

/** Centered dialog on desktop, full-screen on mobile (CSS); `drawer` slides in from the right. */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  variant = 'modal',
}: Props) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className={variant === 'drawer' ? 'drawer' : 'modal'}
          aria-describedby={description ? undefined : undefined}
        >
          <header className="modal-head">
            {icon}
            <div className="modal-title">
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description asChild>
                  <div className="modal-desc">{description}</div>
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="icon-button" aria-label={t('common.close')}>
              <X size={20} aria-hidden />
            </Dialog.Close>
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-foot">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
