import { Text, type DistributiveOmit, type TextProps } from "@saintly-software/baritone";

/**
 * A small, bold, uppercase, letter-spaced label. Size, weight, and case are
 * fixed; other `Text` props, including `letterSpacing`, pass through.
 */
export function Eyebrow({ style, ...rest }: EyebrowProps) {
  return (
    <Text
      size="xs"
      weight="bold"
      saliency="low"
      textTransform="uppercase"
      letterSpacing="widest"
      style={style}
      {...rest}
    />
  );
}

export type EyebrowProps = DistributiveOmit<TextProps, "size" | "weight" | "textTransform">;
