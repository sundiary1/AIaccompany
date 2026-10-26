import type { ReactNode } from "react"
import styles from "./glass-navigation.module.css"
import { useNavigationVisibility } from "./useNavigationVisibility"

/** Shared glass surface for the brand entrance and every functional space. */
export function GlassNavigation({
  children,
  overlay = false,
  home = false,
  autoHide = false,
}: {
  children: ReactNode
  overlay?: boolean
  home?: boolean
  autoHide?: boolean
}) {
  const { panel, hidden, reveal } = useNavigationVisibility(autoHide)
  return (
    <header
      className={styles.slot}
      data-testid="page-header"
      data-overlay={overlay}
      data-home={home}
    >
      {autoHide && (
        <div
          className={styles.hotZone}
          onPointerEnter={reveal}
          aria-hidden="true"
        />
      )}
      <div
        ref={panel}
        className={styles.panel}
        data-testid="glass-navigation"
        data-hidden={hidden}
        inert={hidden}
      >
        {children}
      </div>
      <button
        className={styles.reveal}
        type="button"
        aria-label="展开导航"
        hidden={!hidden}
        onClick={reveal}
      >
        <span aria-hidden="true" />
      </button>
    </header>
  )
}
