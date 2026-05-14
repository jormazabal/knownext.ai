type BrandMarkProps = {
  className?: string;
  variant?: "mark" | "watermark";
};

export function BrandMark({ className = "", variant = "mark" }: BrandMarkProps) {
  const variantClassName = variant === "watermark" ? "knownext-brand-watermark" : "knownext-brand-mark";

  return <span aria-hidden="true" className={[variantClassName, className].filter(Boolean).join(" ")} />;
}
