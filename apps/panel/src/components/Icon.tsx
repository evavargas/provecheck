import { ICONS, LOGO_MARK, type IconName } from '@provecheck/shared';

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx={LOGO_MARK.rect.radius} fill={LOGO_MARK.rect.fill} />
      <path
        d={LOGO_MARK.check}
        fill="none"
        stroke={LOGO_MARK.checkStroke.color}
        strokeWidth={LOGO_MARK.checkStroke.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
