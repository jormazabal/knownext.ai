import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  it("renders the orange brain mark as decorative product chrome", () => {
    const { container } = render(<BrandMark className="h-5 w-5" />);

    const mark = container.querySelector(".knownext-brand-mark");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveClass("h-5", "w-5");
  });

  it("supports the watermark variant without changing accessible text", () => {
    const { container } = render(<BrandMark variant="watermark" />);

    expect(container.querySelector(".knownext-brand-watermark")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("KnowNext");
  });
});
