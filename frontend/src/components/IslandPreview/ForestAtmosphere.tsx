import { Background } from "animal-island-ui"
import { useId } from "react"
import styles from "./forest-experiment.module.css"

/** DOM/SVG scenery sits behind the single transparent scene canvas. */
export function ForestAtmosphere({ moving }: { moving: boolean }) {
  const tree = useId()
  return (
    <div className={styles.atmosphere} aria-hidden="true" data-moving={moving}>
      <Background type="grid" className={styles.paper} />
      <div className={styles.glow} />
      <svg
        aria-hidden="true"
        className={styles.forest}
        viewBox="0 0 1440 500"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          <g id={tree}>
            <path d="M-3 0V-132H3V0Z" />
            <path d="M0-210 42-126H24L57-61H30L72 0H-72L-30-61H-57L-24-126H-42Z" />
          </g>
        </defs>
        <g opacity="0.45">
          <use href={`#${tree}`} transform="translate(40 430) scale(1.5)" />
          <use href={`#${tree}`} transform="translate(160 450) scale(.85)" />
          <use href={`#${tree}`} transform="translate(260 440) scale(1.1)" />
          <use href={`#${tree}`} transform="translate(1190 450) scale(1.05)" />
          <use href={`#${tree}`} transform="translate(1320 455) scale(1.45)" />
          <use href={`#${tree}`} transform="translate(1430 450) scale(.9)" />
        </g>
        <path
          d="M0 438Q180 372 410 444T850 452 1180 418T1440 440V500H0Z"
          opacity=".2"
        />
      </svg>
      <div className={styles.mist} />
      <div className={styles.nearMist} />
    </div>
  )
}
