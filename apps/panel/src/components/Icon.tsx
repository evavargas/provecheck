import { LOGO_MARK } from '@provecheck/shared';

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
