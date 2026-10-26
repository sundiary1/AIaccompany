import { Button, type ButtonProps, type ButtonType } from "animal-island-ui"
import type { ComponentType, RefAttributes } from "react"

type Props = Omit<ButtonProps, "type" | "htmlType"> &
  RefAttributes<HTMLButtonElement> & {
    type?: "button" | "submit" | "reset"
    variant?: ButtonType
  }

// React 19 passes ref as a prop. Pinned upstream 2.3.0 spreads it onto its
// native button, though its public FC declaration omits RefAttributes.
const RefButton = Button as ComponentType<
  ButtonProps & RefAttributes<HTMLButtonElement>
>

/** Keep native form semantics while using the real Animal Island component. */
export function IslandButton({
  type = "button",
  variant = "text",
  ...props
}: Props) {
  return (
    <RefButton
      {...props}
      type={variant}
      htmlType={type}
      data-island-button=""
      data-variant={variant}
    />
  )
}
