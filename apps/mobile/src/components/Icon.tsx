import { ICONS, LOGO_MARK, type IconName } from '@provecheck/shared';
import Svg, { Path, Rect } from 'react-native-svg';

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Path d={ICONS[name]} fill={color} />
    </Svg>
  );
}

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
