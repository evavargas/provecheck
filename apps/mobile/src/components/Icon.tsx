import { LOGO_MARK } from '@provecheck/shared';
import Svg, { Path, Rect } from 'react-native-svg';

export function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Rect width={48} height={48} rx={LOGO_MARK.rect.radius} fill={LOGO_MARK.rect.fill} />
      <Path
        d={LOGO_MARK.check}
        fill="none"
        stroke={LOGO_MARK.checkStroke.color}
        strokeWidth={LOGO_MARK.checkStroke.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
