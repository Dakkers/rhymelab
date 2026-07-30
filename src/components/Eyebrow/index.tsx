import { Text, type DistributiveOmit, type TextProps } from "@saintly-software/baritone";

export type EyebrowProps = DistributiveOmit<TextProps, "size" | "weight" | "textTransform">;

/**
 * Eyebrow — the small, uppercase, letter-spaced label used above page titles and
 * as the section labels in the workbench inspector. It's a plain `Text` fixed to
 * the design system's typographic tokens: size, weight, colour, and now the
 * tracking too (`letterSpacing="widest"`, which Baritone recommends for small
 * uppercase labels). `saliency` / `intent` / spacing props pass straight through,
 * and a caller can still override the tracking with its own `letterSpacing`.
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
